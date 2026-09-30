from __future__ import annotations

from collections import OrderedDict
from datetime import date

from app.application.dto import ConfirmSaleData
from app.application.use_cases.base import UseCase
from app.domain.entities import Sale, StockMovement, User
from app.domain.exceptions import AuthenticationError, NotFoundError, PermissionDeniedError, ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import SaleStatus, StockMovementType
from app.domain.value_objects.permissions import Perm
from app.domain.value_objects.pagination import Page, PageRequest


class ConfirmSaleUseCase(UseCase):
    """Registers a sale in a branch and discounts the branch inventory atomically.

    Steps (BACKEND_SPEC §21): validate user and branch → validate products →
    validate stock → create sale → create details → discount stock → commit.
    Any failure rolls the whole transaction back.

    Each item references an inventory row (product + branch) of the sale branch.
    The sale is a factura or a comprobante; ``cliente_id`` None = consumidor final.
    """

    def execute(self, data: ConfirmSaleData, actor: User) -> Sale:
        items = data.items
        if not actor.estado:
            raise AuthenticationError("El usuario se encuentra inactivo.", code="USER_INACTIVE")
        if not items:
            raise ValidationError("La venta debe incluir al menos un producto.", code="EMPTY_SALE")

        # Merge repeated lines so stock is validated against the total quantity.
        quantities: OrderedDict[int, int] = OrderedDict()
        for item in items:
            if item.cantidad <= 0:
                raise ValidationError("La cantidad debe ser mayor que cero.", code="INVALID_QUANTITY")
            quantities[item.inventory_id] = quantities.get(item.inventory_id, 0) + item.cantidad

        with self.uow.transaction():
            validate_sale_branch(self.uow, actor, data.branch_id)
            if data.cliente_id is not None:
                self._validate_client(data.cliente_id)
            sale = Sale(
                user_id=actor.id,  # type: ignore[arg-type]
                branch_id=data.branch_id,
                factura=data.factura,
                cliente_id=data.cliente_id,
            )
            movements: list[StockMovement] = []
            # Lock rows in a deterministic order to avoid deadlocks.
            for inventory_id in sorted(quantities):
                cantidad = quantities[inventory_id]
                inventory = self.uow.inventory.get_for_update(inventory_id)
                if inventory is None or inventory.branch_id != data.branch_id:
                    raise NotFoundError(
                        "El producto no está registrado en la sucursal de la venta.",
                        code="INVENTORY_NOT_FOUND",
                        details={"inventory_id": inventory_id},
                    )
                product = inventory.product
                if not product.estado:
                    raise ValidationError(
                        f"El producto '{product.nombre}' está inactivo.",
                        code="PRODUCT_INACTIVE",
                        details={"product_id": product.id},
                    )
                inventory.decrease_stock(cantidad)  # raises INSUFFICIENT_STOCK
                sale.add_line(product.id, cantidad, product.precio_venta, inventory_id)  # type: ignore[arg-type]  # PVP
                movements.append(
                    StockMovement(
                        product_id=product.id,  # type: ignore[arg-type]
                        inventory_id=inventory_id,
                        tipo=StockMovementType.VENTA,
                        cantidad=-cantidad,
                        stock_resultante=inventory.stock,
                        user_id=actor.id,
                    )
                )
            self.uow.sales.add(sale)
            self.uow.flush()
            for movement in movements:
                movement.referencia = f"VENTA#{sale.id}"
                self.uow.stock_movements.add(movement)
        return sale

    def _validate_client(self, cliente_id: int) -> None:
        client = self.uow.users.get(cliente_id)
        if client is None or not client.is_client:
            raise ValidationError("El cliente seleccionado no existe.", code="INVALID_CLIENT")
        if not client.estado:
            raise ValidationError("El cliente seleccionado está inactivo.", code="CLIENT_INACTIVE")


def validate_sale_branch(uow: UnitOfWork, actor: User, branch_id: int) -> None:
    """The branch must be active and assigned to the seller (unless ``sales.any_branch``)."""
    branch = uow.branches.get(branch_id)
    if branch is None or not branch.estado:
        raise ValidationError("La sucursal seleccionada no existe o está inactiva.", code="INVALID_BRANCH")
    if branch_id not in actor.branch_ids and not actor.has_permission(Perm.SALES_ANY_BRANCH):
        raise PermissionDeniedError(
            "No está asignado a la sucursal seleccionada.", code="BRANCH_NOT_ASSIGNED", details={"branch_id": branch_id}
        )


class CancelSaleUseCase(UseCase):
    """Cancels a sale and restores the stock of the branch inventory. Final rules are pending (spec §25.9)."""

    def execute(self, sale_id: int, actor: User) -> Sale:
        with self.uow.transaction():
            sale = self.uow.sales.get(sale_id)
            if sale is None:
                raise NotFoundError("Venta no encontrada.", code="SALE_NOT_FOUND")
            sale.cancel()
            for detail in sorted(sale.details, key=lambda d: d.inventory_id or 0):
                inventory = self.uow.inventory.get_for_update(detail.inventory_id) if detail.inventory_id else None
                if inventory is None:  # pragma: no cover - FK guarantees existence
                    continue
                inventory.increase_stock(detail.cantidad)
                self.uow.stock_movements.add(
                    StockMovement(
                        product_id=detail.product_id,
                        inventory_id=inventory.id,
                        tipo=StockMovementType.ANULACION_VENTA,
                        cantidad=detail.cantidad,
                        stock_resultante=inventory.stock,
                        user_id=actor.id,
                        referencia=f"VENTA#{sale.id}",
                    )
                )
        return sale


class SaleQueries(UseCase):
    def get(self, sale_id: int) -> Sale:
        sale = self.uow.sales.get(sale_id)
        if sale is None:
            raise NotFoundError("Venta no encontrada.", code="SALE_NOT_FOUND")
        return sale

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
