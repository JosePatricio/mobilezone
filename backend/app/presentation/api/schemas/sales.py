from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.domain.value_objects.enums import SaleStatus
from app.presentation.api.schemas.common import RequestSchema, Schema
from app.presentation.api.schemas.products import ProductSummary
from app.presentation.api.schemas.users import BranchRef, ClientSummary, UserSummary


class SaleItemRequest(RequestSchema):
    inventory_id: int = Field(description="Inventario (producto + sucursal) del que se descuenta el stock")
    cantidad: int = Field(gt=0)


class CreateSaleRequest(RequestSchema):
    branch_id: int = Field(description="Sucursal de la venta (asignada al vendedor)")
    items: list[SaleItemRequest] = Field(min_length=1)
    factura: bool = Field(default=False, description="true = factura, false = comprobante de venta")
    cliente_id: int | None = Field(default=None, description="null = consumidor final")


class SaleDetailResponse(Schema):
    id: int
    product_id: int
    product: ProductSummary
    inventory_id: int
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal


class SaleResponse(Schema):
    id: int
    user_id: int
    user: UserSummary
    branch_id: int
    branch: BranchRef
    fecha: datetime
    total: Decimal
    estado: SaleStatus
    factura: bool
    cliente_id: int | None
    cliente: ClientSummary | None = Field(description="null = consumidor final")
    details: list[SaleDetailResponse]
    created_at: datetime
    updated_at: datetime
