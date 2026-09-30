from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import Activatable, optional_text, require_text, utcnow
from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import StockMovementType
from app.domain.value_objects.money import ZERO, non_negative_money

if TYPE_CHECKING:
    from app.domain.entities.catalog import Category


def normalize_sku(value: str | None) -> str:
    sku = require_text(value, "sku", 50).upper()
    if any(ch.isspace() for ch in sku):
        raise ValidationError("El SKU no puede contener espacios.", code="INVALID_SKU", details={"field": "sku"})
    return sku


@dataclass(eq=False)
class Product(Activatable):
    """A product of the catalog. Stock lives in the inventory of each branch (see ``Inventory``).

    Prices: ``precio_venta`` (PVP, used in sales), ``precio_costo`` (acquisition
    cost) and ``precio_mayor`` (wholesale). ``imagen`` is the relative path of
    the uploaded image (None = default image).
    """

    category_id: int
    sku: str
    nombre: str
    precio_venta: Decimal
    precio_costo: Decimal = ZERO
    precio_mayor: Decimal = ZERO
    descripcion: str | None = None
    imagen: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        category: Category
        stock_total: int  # read-only: sum of the stock in every branch

    def __post_init__(self) -> None:
        self.sku = normalize_sku(self.sku)
        self.nombre = require_text(self.nombre, "nombre", 150)
        self.descripcion = optional_text(self.descripcion)
        self.change_prices(self.precio_venta, self.precio_costo, self.precio_mayor)

    def change_prices(self, precio_venta: Decimal, precio_costo: Decimal, precio_mayor: Decimal) -> None:
        self.precio_venta = non_negative_money(precio_venta, "precio_venta")
        self.precio_costo = non_negative_money(precio_costo, "precio_costo")
        self.precio_mayor = non_negative_money(precio_mayor, "precio_mayor")


@dataclass(eq=False)
class StockMovement:
    """Audit trail of every stock change of an inventory (product + branch) (BACKEND_SPEC §23)."""

    product_id: int
    tipo: StockMovementType
    cantidad: int  # signed: negative = out, positive = in
    stock_resultante: int
    inventory_id: int | None = None
    user_id: int | None = None
    referencia: str | None = None
    motivo: str | None = None
    fecha: datetime | None = None
    id: int | None = None

    def __post_init__(self) -> None:
        self.tipo = StockMovementType(self.tipo)
        if self.fecha is None:
            self.fecha = utcnow()
