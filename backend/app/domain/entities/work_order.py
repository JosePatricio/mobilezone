from __future__ import annotations

from dataclasses import dataclass, field
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import optional_text, utcnow
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.value_objects.enums import WorkOrderStatus
from app.domain.value_objects.money import ZERO, non_negative_money

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
class WorkOrder:
    user_id: int  # user who registers the order
    cliente_id: int  # client (users table, tipo CLIENTE)
    marca_id: int
    modelo_id: int
    fecha: date | None = None
    tecnico_id: int | None = None  # responsible technician (users table, tipo TECNICO)
    observacion: str | None = None
    estado: int = WorkOrderStatus.ESTADO_0
    garantia: bool = False
    color: str | None = None
    presupuesto: Decimal = ZERO
    anticipo: Decimal = ZERO
    saldo: Decimal = ZERO
    num_orden: int | None = None
    spare_parts: list[WorkOrderSparePart] = field(default_factory=list)
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
        self.garantia = bool(self.garantia)
        if self.fecha is None:
            self.fecha = utcnow().date()
        self.set_amounts(self.presupuesto, self.anticipo)

    @property
    def status(self) -> WorkOrderStatus:
        return WorkOrderStatus(self.estado)

    def set_amounts(self, presupuesto: Decimal, anticipo: Decimal) -> None:
        self.presupuesto, self.anticipo, self.saldo = calculate_balance(presupuesto, anticipo)

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
