from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field

from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS, WorkOrderStatus
from app.domain.value_objects.work_orders import (
    DISPLAY_TYPE_LABELS,
    ENTRY_REASON_LABELS,
    LOCK_TYPE_LABELS,
    DisplayType,
    EntryReason,
    LockType,
    MAX_WARRANTY_DAYS,
)
from app.presentation.api.schemas.catalog import BrandSummary, DeviceModelSummary, SparePartSummary
from app.presentation.api.schemas.common import Money, Name, RequestSchema, Schema, media_url
from app.presentation.api.schemas.users import Celular, ClientSummary, Identificacion, OptionalEmail, UserSummary


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
    motivo_ingreso: EntryReason
    tipo_display: DisplayType | None = Field(default=None, description="Obligatorio si el motivo es CAMBIO_DISPLAY")
    garantia_dias: int = Field(default=0, ge=0, le=MAX_WARRANTY_DAYS, description="Tiempo de garantía en días (0 = sin garantía)")
    bloqueo_tipo: LockType = LockType.NINGUNO
    bloqueo_valor: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)] = Field(
        default=None, description='Patrón "1-5-9-6" (puntos 1..9 por filas) o PIN numérico'
    )
    observacion: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=5000)] = None
    estado: WorkOrderStatus = WorkOrderStatus.ESTADO_0
    presupuesto: Money = Decimal("0")
    anticipo: Money = Decimal("0")
    fecha_entrega: datetime | None = Field(
        default=None, description="Fecha y hora de entrega (ISO 8601; sin zona = hora local del local)"
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


class WorkOrderStatusRequest(RequestSchema):
    estado: WorkOrderStatus


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
    motivo_ingreso: EntryReason
    tipo_display: DisplayType | None
    garantia_dias: int
    color: str | None
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal
    fecha: date
    fecha_entrega: datetime | None

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def motivo_ingreso_label(self) -> str:
        return ENTRY_REASON_LABELS[self.motivo_ingreso]


class WorkOrderResponse(WorkOrderListItem):
    user: UserSummary = Field(description="Usuario que registró la orden")
    observacion: str | None
    modelo_tecnico: str | None
    bloqueo_tipo: LockType
    bloqueo_valor: str | None
    codigo_publico: str = Field(description="Código de la página pública de estado (QR)")
    photos: list[WorkOrderPhotoResponse]
    spare_parts: list[WorkOrderSparePartResponse]
    spare_parts_total: Decimal
    created_at: datetime
    updated_at: datetime


class PublicWorkOrderResponse(Schema):
    """Public status page (QR). No client data, amounts limited to the balance, no unlock code."""

    num_orden: int
    fecha: date
    estado: int
    marca: BrandSummary
    modelo: DeviceModelSummary
    color: str | None
    motivo_ingreso: EntryReason
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
        return ENTRY_REASON_LABELS[self.motivo_ingreso]
