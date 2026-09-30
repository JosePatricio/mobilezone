from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from app.domain.exceptions import InsufficientStockError, ValidationError

if TYPE_CHECKING:
    from app.domain.entities.branch import Branch
    from app.domain.entities.product import Product


def _positive_quantity(cantidad: int) -> int:
    if not isinstance(cantidad, int) or isinstance(cantidad, bool) or cantidad <= 0:
        raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
    return cantidad


@dataclass(eq=False)
class Inventory:
    """Stock of one product in one branch (inventario). Stock can never be negative."""

    product_id: int
    branch_id: int
    stock: int = 0
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        product: Product
        branch: Branch

    def __post_init__(self) -> None:
        if not isinstance(self.stock, int) or isinstance(self.stock, bool) or self.stock < 0:
            raise ValidationError("El stock no puede ser negativo.", code="NEGATIVE_STOCK")

    def _product_name(self) -> str | None:
        product = getattr(self, "product", None)
        return product.nombre if product is not None else None

    def ensure_available(self, cantidad: int) -> None:
        _positive_quantity(cantidad)
        if self.stock < cantidad:
            raise InsufficientStockError(self.product_id, cantidad, self.stock, self._product_name())

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
