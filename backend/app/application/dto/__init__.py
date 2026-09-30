"""Application DTOs: plain data structures passed into use cases.

They decouple use cases from the HTTP schemas of the presentation layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date
from decimal import Decimal


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
class ProductData:
    """Create / update data. Stock is not part of the product: it lives in the
    inventory of each branch (``InventoryData``)."""

    category_id: int
    sku: str
    nombre: str
    precio_venta: Decimal
    precio_costo: Decimal
    precio_mayor: Decimal
    descripcion: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class StockAdjustmentData:
    cantidad: int  # signed delta
    motivo: str | None = None


@dataclass(frozen=True)
class BranchData:
    nombre: str
    ubicacion: str
    telefono: str | None = None
    estado: bool = True


@dataclass(frozen=True)
class InventoryData:
    """Registers a product in a branch with its initial stock."""

    product_id: int
    branch_id: int
    stock: int = 0


@dataclass(frozen=True)
class SaleItemData:
    inventory_id: int  # inventory (product + branch) the units are taken from
    cantidad: int


@dataclass(frozen=True)
class ConfirmSaleData:
    branch_id: int
    items: list[SaleItemData]
    factura: bool = False  # True = factura, False = comprobante de venta
    cliente_id: int | None = None  # None = consumidor final


@dataclass(frozen=True)
class SparePartData:
    tipo: str
    precio: Decimal
    ubicacion: bool = False
    garantia: bool = False
    estado: bool = True


@dataclass(frozen=True)
class UserData:
    """Create / update data. The role defines the kind of user (no separate user type)."""

    nombre: str
    apellido: str
    email: str
    rol_id: int
    password: str | None = None  # on update, None keeps the current password
    identificacion: str | None = None
    celular: str | None = None
    provincia: str | None = None
    ciudad: str | None = None
    estado: bool = True
    branch_ids: list[int] | None = None  # sucursales (required for VENDEDOR)


@dataclass(frozen=True)
class ClientData:
    nombre: str
    apellido: str
    email: str
    identificacion: str
    celular: str | None = None
    provincia: str | None = None
    ciudad: str | None = None
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
