"""Application DTOs: plain data structures passed into use cases.

They decouple use cases from the HTTP schemas of the presentation layer.
"""
from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal

from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.enums import PaymentMethod


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
    direccion: str | None = None
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
    metodo_pago: PaymentMethod = PaymentMethod.EFECTIVO
    monto_recibido: Decimal | None = None  # cash only: amount received from the customer
    factura: bool = False  # True = factura, False = comprobante de venta
    cliente_id: int | None = None  # None = consumidor final


@dataclass(frozen=True)
class UpdateSaleData:
    """Modifies a confirmed sale (returns / changes). ``items`` is the complete new list of lines."""

    items: list[SaleItemData]
    metodo_pago: PaymentMethod = PaymentMethod.EFECTIVO
    monto_recibido: Decimal | None = None
    factura: bool = False
    cliente_id: int | None = None


@dataclass(frozen=True)
class SparePartData:
    tipo: str
    precio: Decimal
    ubicacion: bool = False
    garantia: bool = False
    estado: bool = True


@dataclass(frozen=True)
class AffiliatePartData:
    tipo: AffiliatePartType
    condicion: PartCondition = PartCondition.NUEVO
    garantia: bool = False
    estado: AffiliatePartStatus = AffiliatePartStatus.DISPONIBLE
    descripcion: str | None = None
    precio: Decimal | None = None


@dataclass(frozen=True)
class AffiliatePartFilters:
    tipo: AffiliatePartType | None = None
    condicion: PartCondition | None = None
    estado: AffiliatePartStatus | None = None
    garantia: bool | None = None
    search: str | None = None
    user_id: int | None = None  # affiliate (only with affiliate_parts.any)


@dataclass(frozen=True)
class UserData:
    """Create / update data. The role defines the kind of user (no separate user type)."""

    nombre: str
    apellido: str
    email: str | None  # required except for clients
    rol_id: int
    password: str | None = None  # on update, None keeps the current password
    identificacion: str | None = None
    celular: str | None = None
    provincia: str | None = None
    ciudad: str | None = None
    direccion: str | None = None
    estado: bool = True
    branch_ids: list[int] | None = None  # sucursales (required for VENDEDOR)


@dataclass(frozen=True)
class ProfileData:
    """Own data the logged user can change (Perfil). Role, branches and cédula stay with the administrator."""

    nombre: str
    apellido: str
    email: str
    celular: str | None = None
    provincia: str | None = None
    ciudad: str | None = None
    direccion: str | None = None


@dataclass(frozen=True)
class ClientData:
    nombre: str
    apellido: str
    email: str | None
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
class WorkOrderClientData:
    """The client of a work order, identified by cédula / RUC. It is created when it
    does not exist (role CLIENTE, no password, no email needed)."""

    identificacion: str
    nombre: str
    apellido: str
    celular: str | None = None
    email: str | None = None


@dataclass(frozen=True)
class WorkOrderData:
    cliente: WorkOrderClientData
    marca_id: int
    modelo_id: int
    motivo_ingreso: str
    presupuesto: Decimal  # costo de reparación
    anticipo: Decimal
    tipo_display: str | None = None  # only for CAMBIO_DISPLAY
    garantia_dias: int = 0  # tiempo de garantía (days)
    bloqueo_tipo: str = "NINGUNO"  # NINGUNO | PATRON | PIN
    bloqueo_valor: str | None = None
    observacion: str | None = None
    color: str | None = None
    modelo_tecnico: str | None = None  # technical model code of the phone, e.g. SM-A105M
    fecha_entrega: datetime | None = None  # timezone-aware
    branch_id: int | None = None  # sucursal (local); None = the user's branch
    fecha_hora: datetime | None = None  # reception date and time (timezone-aware); None = now


@dataclass(frozen=True)
class WorkOrderStatusData:
    """Recibido / En proceso. ``fecha_entrega`` (approximate delivery time) is required for En proceso."""

    estado: int
    observacion: str | None = None
    fecha_entrega: datetime | None = None


@dataclass(frozen=True)
class FinalizeWorkOrderData:
    """Closes the order and registers the sale of the repair (total = repair cost; the
    anticipo counts as already paid)."""

    branch_id: int
    metodo_pago: PaymentMethod
    monto_recibido: Decimal | None = None
    observacion: str | None = None


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
    password_por_defecto: bool = False  # the password is still the cédula / RUC
