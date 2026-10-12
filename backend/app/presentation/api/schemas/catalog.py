from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints

from app.presentation.api.schemas.common import Description, LongName, Money, Name, RequestSchema, Schema


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
    modelos_count: int = Field(default=0, description="Número de modelos asignados a la marca")


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


OptionalText = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)]


class SupplierRequest(RequestSchema):
    nombre: LongName
    ruc: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)] = None
    telefono: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)] = None
    email: OptionalText = None
    direccion: OptionalText = None
    estado: bool = True


class SupplierSummary(Schema):
    id: int
    nombre: str


class SupplierResponse(Schema):
    id: int
    nombre: str
    ruc: str | None
    telefono: str | None
    email: str | None
    direccion: str | None
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
