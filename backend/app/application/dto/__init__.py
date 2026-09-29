"""Application DTOs: plain data structures passed into use cases.

They decouple use cases from the HTTP schemas of the presentation layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal

from app.domain.value_objects.enums import UserType


@dataclass(frozen=True)
class CatalogData:
    """Shared by simple catalogs (categories, brands)."""

    nombre: str
    descripcion: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class DeviceModelData:
    brand_id: int
    nombre: str
    descripcion: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class CreateProductData:
    category_id: int
    nombre: str
    precio: Decimal
    stock: int = 0
    descripcion: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class UpdateProductData:
    """Stock is intentionally excluded: it changes only through audited operations."""

    category_id: int
    nombre: str
    precio: Decimal
    descripcion: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class StockAdjustmentData:
    cantidad: int  # signed delta
    motivo: str | None = None


@dataclass(frozen=True)
class SaleItemData:
    product_id: int
    cantidad: int


@dataclass(frozen=True)
class SparePartData:
    tipo: str
    precio: Decimal
    ubicacion: bool = False
    garantia: bool = False
    estado: bool = True


@dataclass(frozen=True)
class CreateUserData:
    nombre: str
    apellido: str
    email: str
    tipo_usuario: UserType
    password: str | None = None
    rol_id: int | None = None
    estado: bool = True


@dataclass(frozen=True)
class UpdateUserData:
    nombre: str
    apellido: str
    email: str
    tipo_usuario: UserType
    rol_id: int | None = None
    estado: bool = True
    password: str | None = None  # None keeps the current password


@dataclass(frozen=True)
class ClientData:
    nombre: str
    apellido: str
    email: str
    estado: bool = True


@dataclass(frozen=True)
class RoleData:
    nombre: str
    descripcion: str | None = None
    estado: bool = True
    permission_ids: list[int] | None = None


@dataclass(frozen=True)
class WorkOrderData:
    cliente_id: int
    marca_id: int
    modelo_id: int
    presupuesto: Decimal
    anticipo: Decimal
    tecnico_id: int | None = None
    observacion: str | None = None
    estado: int = 0
    garantia: bool = False
    color: str | None = None
    fecha: date | None = None


@dataclass(frozen=True)
class WorkOrderSparePartData:
    spare_part_id: int
    cantidad: int
    precio: Decimal | None = None  # defaults to the spare part's current price


@dataclass(frozen=True)
class WorkOrderFilters:
    num_orden: int | None = None
    cliente: str | None = None
    cliente_id: int | None = None
    tecnico_id: int | None = None
    estado: int | None = None
    fecha_desde: date | None = None
    fecha_hasta: date | None = None


@dataclass(frozen=True)
class BalanceResult:
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal


@dataclass
class LoginResult:
    access_token: str
    token_type: str = "bearer"
    expires_at: object = None
    user: object = None
    permissions: list[str] = field(default_factory=list)
