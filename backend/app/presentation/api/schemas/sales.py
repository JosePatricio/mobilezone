from __future__ import annotations

from datetime import datetime
from decimal import Decimal

from pydantic import Field

from app.domain.value_objects.enums import SaleStatus
from app.presentation.api.schemas.common import RequestSchema, Schema
from app.presentation.api.schemas.products import ProductSummary
from app.presentation.api.schemas.users import UserSummary


class SaleItemRequest(RequestSchema):
    product_id: int
    cantidad: int = Field(gt=0)


class CreateSaleRequest(RequestSchema):
    items: list[SaleItemRequest] = Field(min_length=1)


class SaleDetailResponse(Schema):
    id: int
    product_id: int
    product: ProductSummary
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal


class SaleResponse(Schema):
    id: int
    user_id: int
    user: UserSummary
    fecha: datetime
    total: Decimal
    estado: SaleStatus
    details: list[SaleDetailResponse]
    created_at: datetime
    updated_at: datetime
