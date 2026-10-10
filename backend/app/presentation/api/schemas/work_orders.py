from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator, Field, StringConstraints, computed_field

from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS, PaymentMethod, WorkOrderStatus
from app.domain.value_objects.work_orders import (
    DISPLAY_TYPE_LABELS,
    ENTRY_REASON_LABELS,
    LOCK_TYPE_LABELS,
    DisplayType,
    EntryReason,
    LockType,
    MAX_WARRANTY_DAYS,
    entry_reasons_label,
)
from app.presentation.api.schemas.catalog import BrandSummary, DeviceModelSummary, SparePartSummary
from app.presentation.api.schemas.common import Money, Name, RequestSchema, Schema, media_url
from app.presentation.api.schemas.users import Celular, ClientSummary, Identificacion, OptionalEmail, UserSummary


def _as_list(value):
    """A single entry reason (as sent before multiple reasons were allowed) is taken as a list of one."""
    return [value] if isinstance(value, str) else value


EntryReasons = Annotated[list[EntryReason], BeforeValidator(_as_list)]


class WorkOrderClientRequest(RequestSchema):
    """Found by cédula / RUC; registered as a client when it does not exist."""

    identificacion: Identificacion
    nombre: Name
    apellido: Name
    celular: Celular = None
    email: OptionalEmail = Field(default=None, description="Se guarda en el cliente si aún no tiene email")


class WorkOrderRequest(RequestSchema):
    """``user_id`` comes from the authenticated user and ``saldo`` is computed by the backend.
    ``presupuesto`` is the repair cost (costo de reparación)."""

    cliente: WorkOrderClientRequest
    marca_id: int
    modelo_id: int
    color: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=50)] = None
    modelo_tecnico: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=50)] = Field(
        default=None, description="Modelo técnico del teléfono, p. ej. SM-A105M"
    )
    motivo_ingreso: EntryReasons = Field(min_length=1, description="Uno o más motivos de ingreso")
    tipo_display: DisplayType | None = Field(default=None, description="Obligatorio si uno de los motivos es CAMBIO_DISPLAY")
    garantia_dias: int = Field(default=0, ge=0, le=MAX_WARRANTY_DAYS, description="Tiempo de garantía en días (0 = sin garantía)")
    bloqueo_tipo: LockType = LockType.NINGUNO
    bloqueo_valor: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)] = Field(
        default=None, description='Patrón "1-5-9-6" (puntos 1..9 por filas) o PIN numérico'
    )
    observacion: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=5000)] = None
    presupuesto: Money = Decimal("0")
    anticipo: Money = Decimal("0")
    fecha_entrega: datetime | None = Field(
        default=None, description="Fecha y hora de entrega (ISO 8601; sin zona = hora local del local)"
    )
    branch_id: int | None = Field(
        default=None, description="Sucursal (local) que recibe el equipo; vacío = sucursal del usuario"
    )
    fecha_hora: datetime | None = Field(
        default=None,
        description="Fecha y hora de ingreso (ISO 8601; sin zona = hora local). Vacío: ahora al crear, sin cambio al editar",
    )


class WorkOrderStatusOption(Schema):
    value: int
    label: str


class CatalogOption(Schema):
    value: str
    label: str


class WorkOrderCatalogsResponse(Schema):
    motivos_ingreso: list[CatalogOption]
    tipos_display: list[CatalogOption]
    tipos_bloqueo: list[CatalogOption]
    estados: list[WorkOrderStatusOption]

    @classmethod
    def build(cls) -> "WorkOrderCatalogsResponse":
        def options(labels: dict) -> list[CatalogOption]:
            return [CatalogOption(value=k.value, label=v) for k, v in labels.items()]

        return cls(
            motivos_ingreso=options(ENTRY_REASON_LABELS),
            tipos_display=options(DISPLAY_TYPE_LABELS),
            tipos_bloqueo=options(LOCK_TYPE_LABELS),
            estados=[WorkOrderStatusOption(value=int(k), label=v) for k, v in WORK_ORDER_STATUS_LABELS.items()],
        )


class WorkOrderPhotoResponse(Schema):
    id: int
    ruta: str = Field(exclude=True)
    created_at: datetime | None = None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def url(self) -> str | None:
        return media_url(self.ruta)


Note = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=1000)]


class WorkOrderStatusRequest(RequestSchema):
    """Recibido (0) / En proceso (1). Finalizado uses ``POST /work-orders/{id}/finalize``."""

    estado: WorkOrderStatus
    fecha_entrega: datetime | None = Field(
        default=None, description="Hora aproximada de entrega (obligatoria para En proceso; sin zona = hora local)"
    )
    observacion: Note = None


class FinalizeWorkOrderRequest(RequestSchema):
    """Closes the order (no more changes) and registers the sale of the repair."""

    branch_id: int = Field(description="Sucursal donde se registra la venta")
    metodo_pago: PaymentMethod = Field(description="Pago del saldo: EFECTIVO, TRANSFERENCIA o TARJETA (+6 % del saldo)")
    monto_recibido: Money | None = Field(default=None, description="Solo efectivo: monto recibido para el cambio")
    observacion: Note = None


class StatusChangeResponse(Schema):
    id: int
    estado: int
    observacion: str | None
    fecha_entrega: datetime | None
    user: UserSummary
    created_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]


class WorkOrderSaleRef(Schema):
    """Sale registered when the order was finalized."""

    id: int
    fecha: datetime
    total: Decimal
    total_pagar: Decimal
    metodo_pago: PaymentMethod | None


class BalanceRequest(RequestSchema):
    presupuesto: Money
    anticipo: Money


class BalanceResponse(Schema):
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal


class AddWorkOrderSparePartRequest(RequestSchema):
    spare_part_id: int
    cantidad: int = Field(default=1, gt=0)
    precio: Money | None = Field(default=None, description="Por defecto, el precio actual del repuesto")


class WorkOrderSparePartResponse(Schema):
    id: int
    work_order_id: int
    spare_part_id: int
    spare_part: SparePartSummary
    technician_id: int
    technician: UserSummary
    cantidad: int
    precio: Decimal
    subtotal: Decimal
    fecha: datetime


class BranchContact(Schema):
    """Contact data of the shop printed on the receipt."""

    id: int
    nombre: str
    ubicacion: str
    direccion: str | None
    telefono: str | None


class WorkOrderListItem(Schema):
    id: int
    num_orden: int
    user_id: int
    cliente_id: int
    cliente: ClientSummary
    tecnico_id: int | None
    tecnico: UserSummary | None
    marca_id: int
    marca: BrandSummary
    modelo_id: int
    modelo: DeviceModelSummary
    estado: int
    motivo_ingreso: list[EntryReason]
    tipo_display: DisplayType | None
    garantia_dias: int
    color: str | None
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal
    fecha: date
    fecha_hora: datetime = Field(description="Fecha y hora de ingreso")
    fecha_entrega: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def motivo_ingreso_label(self) -> str:
        return entry_reasons_label(self.motivo_ingreso)


class WorkOrderResponse(WorkOrderListItem):
    user: UserSummary = Field(description="Usuario que registró la orden")
    branch_id: int | None
    branch: BranchContact | None = Field(description="Sucursal (local): dirección y teléfono para la orden impresa")
    observacion: str | None
    modelo_tecnico: str | None
    bloqueo_tipo: LockType
    bloqueo_valor: str | None
    codigo_publico: str = Field(description="Código de la página pública de estado (QR)")
    photos: list[WorkOrderPhotoResponse]
    status_changes: list[StatusChangeResponse] = Field(description="Historial de estados")
    sale: WorkOrderSaleRef | None = Field(description="Venta registrada al finalizar")
    spare_parts: list[WorkOrderSparePartResponse]
    spare_parts_total: Decimal
    created_at: datetime
    updated_at: datetime


class PublicWorkOrderResponse(Schema):
    """Public status page (QR). No client data, amounts limited to the balance, no unlock code."""

    num_orden: int
    fecha: date
    fecha_hora: datetime
    estado: int
    marca: BrandSummary
    modelo: DeviceModelSummary
    color: str | None
    motivo_ingreso: list[EntryReason]
    tipo_display: DisplayType | None
    garantia_dias: int
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal
    fecha_entrega: datetime | None
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def motivo_ingreso_label(self) -> str:
        return entry_reasons_label(self.motivo_ingreso)
