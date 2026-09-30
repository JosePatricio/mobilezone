from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints

from app.domain.value_objects.enums import StockMovementType
from app.presentation.api.schemas.common import RequestSchema, Schema
from app.presentation.api.schemas.products import _WithImage

Telefono = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)]


class BranchRequest(RequestSchema):
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    ubicacion: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=255)]
    telefono: Telefono = None
    estado: bool = True


class BranchSummary(Schema):
    id: int
    nombre: str


class BranchResponse(Schema):
    id: int
    nombre: str
    ubicacion: str
    telefono: str | None
    estado: bool
    created_at: datetime
    updated_at: datetime


class InventoryProduct(_WithImage):
    id: int
    sku: str
    nombre: str
    precio_venta: Decimal
    estado: bool


class InventoryRequest(RequestSchema):
    product_id: int
    branch_id: int
    stock: int = Field(default=0, ge=0, description="Stock inicial en la sucursal")


class InventoryResponse(Schema):
    """Stock of a product in a branch. ``id`` is the inventory id used by sales."""

    id: int
    product_id: int
    product: InventoryProduct
    branch_id: int
    branch: BranchSummary
    stock: int
    updated_at: datetime


class StockAdjustmentRequest(RequestSchema):
    cantidad: int = Field(description="Positivo = entrada, negativo = salida. Distinto de cero.")
    motivo: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)] = None


class StockMovementResponse(Schema):
    id: int
    product_id: int
    inventory_id: int | None
    tipo: StockMovementType
    cantidad: int
    stock_resultante: int
    user_id: int | None
    referencia: str | None
    motivo: str | None
    fecha: datetime
