from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field

from app.domain.value_objects.enums import StockMovementType
from app.presentation.api.schemas.catalog import CategorySummary
from app.presentation.api.schemas.common import Description, LongName, Money, RequestSchema, Schema, media_url


Sku = Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50, pattern=r"^\S+$")]


class ProductRequest(RequestSchema):
    """Create / update. There is no stock field: new products start at 0 and stock
    changes only with ``PATCH /products/{id}/stock`` and sales. The image is uploaded
    with ``PUT /products/{id}/image``."""

    category_id: int
    sku: Sku
    nombre: LongName
    descripcion: Description = None
    precio_venta: Money = Field(description="PVP")
    precio_costo: Money = Field(description="Precio de adquisición")
    precio_mayor: Money = Field(description="Precio de venta al por mayor")
    estado: bool = True


class StockAdjustmentRequest(RequestSchema):
    cantidad: int = Field(description="Positivo = entrada, negativo = salida. Distinto de cero.")
    motivo: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None


class _WithImage(Schema):
    imagen: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def imagen_url(self) -> str | None:
        return media_url(self.imagen)


class ProductSummary(_WithImage):
    id: int
    sku: str
    nombre: str


class ProductResponse(_WithImage):
    id: int
    category_id: int
    category: CategorySummary
    sku: str
    nombre: str
    descripcion: str | None
    precio_venta: Decimal
    precio_costo: Decimal
    precio_mayor: Decimal
    stock: int
    estado: bool
    created_at: datetime
    updated_at: datetime


class ProductStockResponse(Schema):
    product_id: int
    nombre: str
    stock: int
    estado: bool


class StockMovementResponse(Schema):
    id: int
    product_id: int
    tipo: StockMovementType
    cantidad: int
    stock_resultante: int
    user_id: int | None
    referencia: str | None
    motivo: str | None
    fecha: datetime
