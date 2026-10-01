from __future__ import annotations

from collections import OrderedDict
from datetime import date

from app.application.dto import ConfirmSaleData, SaleItemData, UpdateSaleData
from app.application.services.receipts import ReceiptRenderer
from app.application.use_cases.base import UseCase
from app.application.use_cases.branch_access import ensure_branch_access
from app.domain.entities import Inventory, Sale, StockMovement, User
from app.domain.exceptions import AuthenticationError, NotFoundError, ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import SaleStatus, StockMovementType
from app.domain.value_objects.pagination import Page, PageRequest


def _merge_quantities(items: list[SaleItemData]) -> OrderedDict[int, int]:
    """Merges repeated lines so stock is validated against the total quantity of each inventory."""
    if not items:
        raise ValidationError("La venta debe incluir al menos un producto.", code="EMPTY_SALE")
    quantities: OrderedDict[int, int] = OrderedDict()
    for item in items:
        if item.cantidad <= 0:
            raise ValidationError("La cantidad debe ser mayor que cero.", code="INVALID_QUANTITY")
        quantities[item.inventory_id] = quantities.get(item.inventory_id, 0) + item.cantidad
    return quantities


def _get_sale(uow: UnitOfWork, sale_id: int) -> Sale:
    sale = uow.sales.get(sale_id)
    if sale is None:
        raise NotFoundError("Venta no encontrada.", code="SALE_NOT_FOUND")
    return sale


class _SaleValidation(UseCase):
    def _validate_client(self, cliente_id: int | None) -> None:
        if cliente_id is None:
            return
        client = self.uow.users.get(cliente_id)
        if client is None or not client.is_client:
            raise ValidationError("El cliente seleccionado no existe.", code="INVALID_CLIENT")
        if not client.estado:
            raise ValidationError("El cliente seleccionado está inactivo.", code="CLIENT_INACTIVE")

    def _lock_inventory(self, inventory_id: int, branch_id: int) -> Inventory:
        inventory = self.uow.inventory.get_for_update(inventory_id)
        if inventory is None or inventory.branch_id != branch_id:
            raise NotFoundError(
                "El producto no está registrado en la sucursal de la venta.",
                code="INVENTORY_NOT_FOUND",
                details={"inventory_id": inventory_id},
            )
        return inventory

    @staticmethod
    def _ensure_active(inventory: Inventory) -> None:
        product = inventory.product
        if not product.estado:
            raise ValidationError(
                f"El producto '{product.nombre}' está inactivo.",
                code="PRODUCT_INACTIVE",
                details={"product_id": product.id},
            )

    def _movement(
        self, inventory: Inventory, tipo: StockMovementType, cantidad: int, actor: User, sale_id: int | None
    ) -> None:
        self.uow.stock_movements.add(
            StockMovement(
                product_id=inventory.product_id,
                inventory_id=inventory.id,
                tipo=tipo,
                cantidad=cantidad,
                stock_resultante=inventory.stock,
                user_id=actor.id,
                referencia=f"VENTA#{sale_id}" if sale_id else None,
            )
        )


class ConfirmSaleUseCase(_SaleValidation):
    """Registers a sale in a branch and discounts the branch inventory atomically.

    Steps (BACKEND_SPEC §21): validate user and branch → validate products →
    validate stock → create sale → create details → discount stock → payment → commit.
    Any failure rolls the whole transaction back.

    Each item references an inventory row (product + branch) of the sale branch.
    The sale is a factura or a comprobante; ``cliente_id`` None = consumidor final.
    """

    def execute(self, data: ConfirmSaleData, actor: User) -> Sale:
        if not actor.estado:
            raise AuthenticationError("El usuario se encuentra inactivo.", code="USER_INACTIVE")
        quantities = _merge_quantities(data.items)

        with self.uow.transaction():
            ensure_branch_access(self.uow, actor, data.branch_id)
            self._validate_client(data.cliente_id)
            sale = Sale(
                user_id=actor.id,  # type: ignore[arg-type]
                branch_id=data.branch_id,
                factura=data.factura,
                cliente_id=data.cliente_id,
            )
            locked: list[tuple[Inventory, int]] = []
            # Lock rows in a deterministic order to avoid deadlocks.
            for inventory_id in sorted(quantities):
                cantidad = quantities[inventory_id]
                inventory = self._lock_inventory(inventory_id, data.branch_id)
                self._ensure_active(inventory)
                inventory.decrease_stock(cantidad)  # raises INSUFFICIENT_STOCK
                product = inventory.product
                sale.add_line(product.id, cantidad, product.precio_venta, inventory_id)  # type: ignore[arg-type]  # PVP
                locked.append((inventory, cantidad))
            sale.apply_payment(data.metodo_pago, data.monto_recibido)
            self.uow.sales.add(sale)
            self.uow.flush()
            for inventory, cantidad in locked:
                self._movement(inventory, StockMovementType.VENTA, -cantidad, actor, sale.id)
        return sale


class UpdateSaleUseCase(_SaleValidation):
    """Modifies a confirmed sale: returns (fewer units / removed products) and changes.

    Stock is reconciled per inventory row: units added are discounted (validating the
    available stock) and units returned go back to the branch (``DEVOLUCION``).
    Existing lines keep their historical price; new lines take the current PVP.
    The payment (method, card surcharge, change) is recalculated.
    """

    def execute(self, sale_id: int, data: UpdateSaleData, actor: User) -> Sale:
        new_quantities = _merge_quantities(data.items)
        with self.uow.transaction():
            sale = _get_sale(self.uow, sale_id)
            sale.ensure_editable()
            ensure_branch_access(self.uow, actor, sale.branch_id)  # type: ignore[arg-type]
            self._validate_client(data.cliente_id)

            lines = {d.inventory_id: d for d in sale.details}
            for inventory_id in sorted(set(lines) | set(new_quantities)):
                old_qty = lines[inventory_id].cantidad if inventory_id in lines else 0
                new_qty = new_quantities.get(inventory_id, 0)
                if new_qty == old_qty:
                    continue
                inventory = self._lock_inventory(inventory_id, sale.branch_id)  # type: ignore[arg-type]
                if new_qty > old_qty:
                    if old_qty == 0:
                        self._ensure_active(inventory)
                    inventory.decrease_stock(new_qty - old_qty)  # raises INSUFFICIENT_STOCK
                    self._movement(inventory, StockMovementType.VENTA, -(new_qty - old_qty), actor, sale.id)
                else:
                    inventory.increase_stock(old_qty - new_qty)
                    self._movement(inventory, StockMovementType.DEVOLUCION, old_qty - new_qty, actor, sale.id)

                if old_qty == 0:
                    product = inventory.product
                    sale.add_line(product.id, new_qty, product.precio_venta, inventory_id)  # type: ignore[arg-type]
                elif new_qty == 0:
                    sale.details.remove(lines[inventory_id])
                else:
                    lines[inventory_id].change_quantity(new_qty)

            sale.factura = data.factura
            sale.cliente_id = data.cliente_id
            sale.recalculate_total()
            sale.apply_payment(data.metodo_pago, data.monto_recibido)
        return sale


class CancelSaleUseCase(_SaleValidation):
    """Deletes (cancels) a sale: it stays as ANULADA for auditing and the stock goes back
    to the branch inventory. Final return/cancel rules are pending (spec §25.9)."""

    def execute(self, sale_id: int, actor: User) -> Sale:
        with self.uow.transaction():
            sale = _get_sale(self.uow, sale_id)
            sale.cancel()
            for detail in sorted(sale.details, key=lambda d: d.inventory_id or 0):
                inventory = self.uow.inventory.get_for_update(detail.inventory_id) if detail.inventory_id else None
                if inventory is None:  # pragma: no cover - FK guarantees existence
                    continue
                inventory.increase_stock(detail.cantidad)
                self._movement(inventory, StockMovementType.ANULACION_VENTA, detail.cantidad, actor, sale.id)
        return sale


class SaleQueries(UseCase):
    def get(self, sale_id: int) -> Sale:
        return _get_sale(self.uow, sale_id)

    def list(
        self,
        page: PageRequest,
        user_id: int | None = None,
        estado: SaleStatus | None = None,
        fecha_desde: date | None = None,
        fecha_hasta: date | None = None,
    ) -> Page[Sale]:
        return self.uow.sales.list(
            page, user_id=user_id, estado=estado, fecha_desde=fecha_desde, fecha_hasta=fecha_hasta
        )


class GetSaleReceiptUseCase(UseCase):
    """PDF receipt (comprobante) of a sale."""

    def __init__(self, uow: UnitOfWork, renderer: ReceiptRenderer) -> None:
        super().__init__(uow)
        self.renderer = renderer

    def execute(self, sale_id: int) -> bytes:
        return self.renderer.render(_get_sale(self.uow, sale_id))
