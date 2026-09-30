from __future__ import annotations

from collections import OrderedDict
from datetime import date

from app.application.dto import ConfirmSaleData
from app.application.use_cases.base import UseCase
from app.domain.entities import Sale, StockMovement, User
from app.domain.exceptions import AuthenticationError, NotFoundError, ValidationError
from app.domain.value_objects.enums import SaleStatus, StockMovementType
from app.domain.value_objects.pagination import Page, PageRequest


class ConfirmSaleUseCase(UseCase):
    """Registers a sale with several products and discounts stock atomically.

    Steps (BACKEND_SPEC §21): validate user → validate products → validate
    stock → create sale → create details → discount stock → commit.
    Any failure rolls the whole transaction back.

    The sale is a factura or a comprobante; ``cliente_id`` None = consumidor final.
    """

    def execute(self, data: ConfirmSaleData, actor: User) -> Sale:
        items = data.items
        if not actor.estado:
            raise AuthenticationError("El usuario se encuentra inactivo.", code="USER_INACTIVE")
        if not items:
            raise ValidationError("La venta debe incluir al menos un producto.", code="EMPTY_SALE")

        # Merge repeated products so stock is validated against the total quantity.
        quantities: OrderedDict[int, int] = OrderedDict()
        for item in items:
            if item.cantidad <= 0:
                raise ValidationError("La cantidad debe ser mayor que cero.", code="INVALID_QUANTITY")
            quantities[item.product_id] = quantities.get(item.product_id, 0) + item.cantidad

        with self.uow.transaction():
            if data.cliente_id is not None:
                self._validate_client(data.cliente_id)
            sale = Sale(user_id=actor.id, factura=data.factura, cliente_id=data.cliente_id)  # type: ignore[arg-type]
            movements: list[StockMovement] = []
            # Lock rows in a deterministic order to avoid deadlocks.
            for product_id in sorted(quantities):
                cantidad = quantities[product_id]
                product = self.uow.products.get_for_update(product_id)
                if product is None:
                    raise NotFoundError(
                        f"Producto {product_id} no encontrado.",
                        code="PRODUCT_NOT_FOUND",
                        details={"product_id": product_id},
                    )
                if not product.estado:
                    raise ValidationError(
                        f"El producto '{product.nombre}' está inactivo.",
                        code="PRODUCT_INACTIVE",
                        details={"product_id": product_id},
                    )
                product.decrease_stock(cantidad)  # raises INSUFFICIENT_STOCK
                sale.add_line(product_id, cantidad, product.precio_venta)  # PVP
                movements.append(
                    StockMovement(
                        product_id=product_id,
                        tipo=StockMovementType.VENTA,
                        cantidad=-cantidad,
                        stock_resultante=product.stock,
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


class CancelSaleUseCase(UseCase):
    """Cancels a sale and restores stock. Final return/cancel rules are pending (spec §25.9)."""

    def execute(self, sale_id: int, actor: User) -> Sale:
        with self.uow.transaction():
            sale = self.uow.sales.get(sale_id)
            if sale is None:
                raise NotFoundError("Venta no encontrada.", code="SALE_NOT_FOUND")
            sale.cancel()
            for detail in sorted(sale.details, key=lambda d: d.product_id):
                product = self.uow.products.get_for_update(detail.product_id)
                if product is None:  # pragma: no cover - FK guarantees existence
                    continue
                product.increase_stock(detail.cantidad)
                self.uow.stock_movements.add(
                    StockMovement(
                        product_id=product.id,  # type: ignore[arg-type]
                        tipo=StockMovementType.ANULACION_VENTA,
                        cantidad=detail.cantidad,
                        stock_resultante=product.stock,
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
