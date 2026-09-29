from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints

from app.domain.value_objects.enums import StockMovementType
from app.presentation.api.schemas.catalog import CategorySummary
from app.presentation.api.schemas.common import Description, LongName, Money, RequestSchema, Schema


class CreateProductRequest(RequestSchema):
    category_id: int
    nombre: LongName
    descripcion: Description = None
    precio: Money
    stock: int = Field(default=0, ge=0)
    estado: bool = True


class UpdateProductRequest(RequestSchema):
    """Stock is not editable here; use ``PATCH /products/{id}/stock``."""

    category_id: int
    nombre: LongName
    descripcion: Description = None
    precio: Money
    estado: bool = True


class StockAdjustmentRequest(RequestSchema):
    cantidad: int = Field(description="Positivo = entrada, negativo = salida. Distinto de cero.")
    motivo: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None


class ProductSummary(Schema):
    id: int
    nombre: str


class ProductResponse(Schema):
    id: int
    category_id: int
    category: CategorySummary
    nombre: str
    descripcion: str | None
    precio: Decimal
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
