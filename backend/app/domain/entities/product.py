from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import Activatable, optional_text, require_text, utcnow
from app.domain.exceptions import InsufficientStockError, ValidationError
from app.domain.value_objects.enums import StockMovementType
from app.domain.value_objects.money import non_negative_money

if TYPE_CHECKING:
    from app.domain.entities.catalog import Category


def _positive_quantity(cantidad: int) -> int:
    if not isinstance(cantidad, int) or isinstance(cantidad, bool) or cantidad <= 0:
        raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
    return cantidad


@dataclass(eq=False)
class Product(Activatable):
    category_id: int
    nombre: str
    precio: Decimal
    stock: int = 0
    descripcion: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        category: Category

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 150)
        self.descripcion = optional_text(self.descripcion)
        self.precio = non_negative_money(self.precio, "precio")
        if not isinstance(self.stock, int) or self.stock < 0:
            raise ValidationError("El stock no puede ser negativo.", code="NEGATIVE_STOCK")

    def change_price(self, precio: Decimal) -> None:
        self.precio = non_negative_money(precio, "precio")

    def ensure_available(self, cantidad: int) -> None:
        _positive_quantity(cantidad)
        if self.stock < cantidad:
            raise InsufficientStockError(self.id or 0, cantidad, self.stock, self.nombre)

    def decrease_stock(self, cantidad: int) -> None:
        """stock_nuevo = stock_actual - cantidad. Never allows negative stock."""
        self.ensure_available(cantidad)
        self.stock -= cantidad

    def increase_stock(self, cantidad: int) -> None:
        self.stock += _positive_quantity(cantidad)

    def adjust_stock(self, delta: int) -> None:
        if delta == 0:
            raise ValidationError("El ajuste de stock no puede ser cero.", code="INVALID_QUANTITY")
        if delta > 0:
            self.increase_stock(delta)
        else:
            self.decrease_stock(-delta)


@dataclass(eq=False)
class StockMovement:
    """Audit trail of every stock change (BACKEND_SPEC §23)."""

    product_id: int
    tipo: StockMovementType
    cantidad: int  # signed: negative = out, positive = in
    stock_resultante: int
    user_id: int | None = None
    referencia: str | None = None
    motivo: str | None = None
    fecha: datetime | None = None
    id: int | None = None

    def __post_init__(self) -> None:
        self.tipo = StockMovementType(self.tipo)
        if self.fecha is None:
            self.fecha = utcnow()
