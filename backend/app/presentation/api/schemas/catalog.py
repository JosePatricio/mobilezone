from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import StringConstraints

from app.presentation.api.schemas.common import Description, Money, Name, RequestSchema, Schema


class CatalogRequest(RequestSchema):
    nombre: Name
    descripcion: Description = None
    estado: bool = True


class CategorySummary(Schema):
    id: int
    nombre: str


class CategoryResponse(Schema):
    id: int
    nombre: str
    descripcion: str | None
    estado: bool
    created_at: datetime
    updated_at: datetime


class BrandSummary(Schema):
    id: int
    nombre: str


class BrandResponse(CategoryResponse):
    pass


class DeviceModelRequest(CatalogRequest):
    brand_id: int


class DeviceModelSummary(Schema):
    id: int
    nombre: str


class DeviceModelResponse(Schema):
    id: int
    brand_id: int
    brand: BrandSummary
    nombre: str
    descripcion: str | None
    estado: bool
    created_at: datetime
    updated_at: datetime


class SparePartRequest(RequestSchema):
    tipo: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    ubicacion: bool = False
    precio: Money
    garantia: bool = False
    estado: bool = True


class SparePartSummary(Schema):
    id: int
    tipo: str


class SparePartResponse(Schema):
    id: int
    tipo: str
    ubicacion: bool
    precio: Decimal
    garantia: bool
    estado: bool
    created_at: datetime
    updated_at: datetime
