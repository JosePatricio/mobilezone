from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import utcnow
from app.domain.exceptions import ConflictError, ValidationError
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.money import ZERO, non_negative_money

if TYPE_CHECKING:
    from app.domain.entities.product import Product
    from app.domain.entities.user import User


@dataclass(eq=False)
class SaleDetail:
    """A sale line. ``precio_unitario`` is the historical price at sale time."""

    product_id: int
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal = ZERO
    sale_id: int | None = None
    id: int | None = None

    if TYPE_CHECKING:
        product: Product

    def __post_init__(self) -> None:
        if not isinstance(self.cantidad, int) or self.cantidad <= 0:
            raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
        self.precio_unitario = non_negative_money(self.precio_unitario, "precio_unitario")
        self.subtotal = self.precio_unitario * self.cantidad


@dataclass(eq=False)
class Sale:
    user_id: int
    fecha: datetime | None = None
    total: Decimal = ZERO
    estado: SaleStatus = SaleStatus.CONFIRMADA
    details: list[SaleDetail] = field(default_factory=list)
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        user: User

    def __post_init__(self) -> None:
        self.estado = SaleStatus(self.estado)
        if self.fecha is None:
            self.fecha = utcnow()

    def add_line(self, product_id: int, cantidad: int, precio_unitario: Decimal) -> SaleDetail:
        if self.estado != SaleStatus.CONFIRMADA:
            raise ConflictError("No se pueden agregar productos a una venta anulada.", code="SALE_NOT_EDITABLE")
        detail = SaleDetail(product_id=product_id, cantidad=cantidad, precio_unitario=precio_unitario)
        self.details.append(detail)
        self.recalculate_total()
        return detail

    def recalculate_total(self) -> None:
        self.total = sum((d.subtotal for d in self.details), ZERO)

    def cancel(self) -> None:
        if self.estado == SaleStatus.ANULADA:
            raise ConflictError("La venta ya se encuentra anulada.", code="SALE_ALREADY_CANCELLED")
        self.estado = SaleStatus.ANULADA
