from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import optional_text, utcnow
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.value_objects.enums import WorkOrderStatus
from app.domain.value_objects.money import ZERO, non_negative_money
from app.domain.value_objects.work_orders import (
    DisplayType,
    EntryReason,
    LockType,
    WarrantyType,
    validate_entry,
    validate_lock,
)

MAX_WORK_ORDER_PHOTOS = 3

if TYPE_CHECKING:
    from app.domain.entities.catalog import Brand, DeviceModel
    from app.domain.entities.spare_part import SparePart
    from app.domain.entities.user import User


def calculate_balance(presupuesto: Decimal, anticipo: Decimal) -> tuple[Decimal, Decimal, Decimal]:
    """Business rule: ``saldo = presupuesto - anticipo``.

    Returns the normalized ``(presupuesto, anticipo, saldo)``. Rules for
    overpayments are pending definition, so for now an anticipo greater than
    the presupuesto is rejected (the saldo can never be negative).
    """
    presupuesto = non_negative_money(presupuesto, "presupuesto")
    anticipo = non_negative_money(anticipo, "anticipo")
    if anticipo > presupuesto:
        raise ValidationError(
            "El anticipo no puede ser mayor que el presupuesto.", code="ADVANCE_EXCEEDS_BUDGET"
        )
    return presupuesto, anticipo, presupuesto - anticipo


@dataclass(eq=False)
class WorkOrderSparePart:
    """A spare part used in a work order, registered by a technician."""

    spare_part_id: int
    technician_id: int
    cantidad: int
    precio: Decimal
    fecha: datetime | None = None
    work_order_id: int | None = None
    id: int | None = None

    if TYPE_CHECKING:
        spare_part: SparePart
        technician: User

    def __post_init__(self) -> None:
        if not isinstance(self.cantidad, int) or self.cantidad <= 0:
            raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
        self.precio = non_negative_money(self.precio, "precio")
        if self.fecha is None:
            self.fecha = utcnow()

    @property
    def subtotal(self) -> Decimal:
        return self.precio * self.cantidad


@dataclass(eq=False)
class WorkOrderPhoto:
    """A photo of the device taken at reception (up to MAX_WORK_ORDER_PHOTOS per order)."""

    ruta: str  # relative path in the media storage
    work_order_id: int | None = None
    id: int | None = None
    created_at: datetime | None = None


@dataclass(eq=False)
class WorkOrder:
    """A repair order. ``presupuesto`` is the repair cost (costo de reparación).

    ``codigo_publico`` is an unguessable code used by the public status page (QR).
    ``bloqueo_valor`` holds the device unlock pattern ("1-5-9-6") or PIN: it is
    sensitive and never exposed by the public endpoint.
    """

    user_id: int  # user who registers the order
    cliente_id: int  # client (users table, role CLIENTE)
    marca_id: int
    modelo_id: int
    motivo_ingreso: EntryReason = EntryReason.OTROS
    tipo_display: DisplayType | None = None  # only for CAMBIO_DISPLAY
    tipo_garantia: WarrantyType = WarrantyType.SIN_GARANTIA
    bloqueo_tipo: LockType = LockType.NINGUNO
    bloqueo_valor: str | None = None
    fecha: date | None = None
    tecnico_id: int | None = None  # responsible technician (users table, role TECNICO)
    observacion: str | None = None
    estado: int = WorkOrderStatus.ESTADO_0
    color: str | None = None
    presupuesto: Decimal = ZERO
    anticipo: Decimal = ZERO
    saldo: Decimal = ZERO
    num_orden: int | None = None
    codigo_publico: str | None = None
    spare_parts: list[WorkOrderSparePart] = field(default_factory=list)
    photos: list[WorkOrderPhoto] = field(default_factory=list)
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        user: User
        cliente: User
        tecnico: User | None
        marca: Brand
        modelo: DeviceModel

    def __post_init__(self) -> None:
        self.estado = int(WorkOrderStatus.parse(self.estado))
        self.observacion = optional_text(self.observacion)
        self.color = optional_text(self.color)
        self.set_entry(self.motivo_ingreso, self.tipo_display)  # type: ignore[arg-type]
        self.tipo_garantia = WarrantyType(self.tipo_garantia)
        self.set_lock(self.bloqueo_tipo, self.bloqueo_valor)
        if self.fecha is None:
            self.fecha = utcnow().date()
        self.set_amounts(self.presupuesto, self.anticipo)

    @property
    def status(self) -> WorkOrderStatus:
        return WorkOrderStatus(self.estado)

    def set_amounts(self, presupuesto: Decimal, anticipo: Decimal) -> None:
        self.presupuesto, self.anticipo, self.saldo = calculate_balance(presupuesto, anticipo)

    def set_entry(self, motivo_ingreso: str, tipo_display: str | None) -> None:
        self.motivo_ingreso, self.tipo_display = validate_entry(motivo_ingreso, tipo_display)

    def set_lock(self, tipo: str, valor: str | None) -> None:
        self.bloqueo_tipo, self.bloqueo_valor = validate_lock(tipo, valor)

    def add_photo(self, photo: WorkOrderPhoto) -> WorkOrderPhoto:
        if len(self.photos) >= MAX_WORK_ORDER_PHOTOS:
            raise ValidationError(
                f"La orden admite como máximo {MAX_WORK_ORDER_PHOTOS} fotos.", code="TOO_MANY_PHOTOS"
            )
        self.photos.append(photo)
        return photo

    def remove_photo(self, photo_id: int) -> WorkOrderPhoto:
        for photo in self.photos:
            if photo.id == photo_id:
                self.photos.remove(photo)
                return photo
        raise NotFoundError("La foto no pertenece a esta orden.", code="WORK_ORDER_PHOTO_NOT_FOUND")

    def change_status(self, estado: int) -> None:
        self.estado = int(WorkOrderStatus.parse(estado))

    def add_spare_part(self, item: WorkOrderSparePart) -> WorkOrderSparePart:
        self.spare_parts.append(item)
        return item

    def remove_spare_part(self, item_id: int) -> WorkOrderSparePart:
        for item in self.spare_parts:
            if item.id == item_id:
                self.spare_parts.remove(item)
                return item
        raise NotFoundError("El repuesto no pertenece a esta orden.", code="WORK_ORDER_SPARE_PART_NOT_FOUND")

    @property
    def spare_parts_total(self) -> Decimal:
        return sum((item.subtotal for item in self.spare_parts), ZERO)
