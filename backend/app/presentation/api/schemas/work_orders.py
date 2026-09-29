from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field

from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS, WorkOrderStatus
from app.presentation.api.schemas.catalog import BrandSummary, DeviceModelSummary, SparePartSummary
from app.presentation.api.schemas.common import Money, RequestSchema, Schema
from app.presentation.api.schemas.users import UserSummary


class WorkOrderRequest(RequestSchema):
    """``user_id`` comes from the authenticated user and ``saldo`` is computed by the backend."""

    cliente_id: int
    tecnico_id: int | None = Field(default=None, description="Omitir para autoasignar al técnico autenticado")
    marca_id: int
    modelo_id: int
    observacion: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=5000)] = None
    estado: WorkOrderStatus = WorkOrderStatus.ESTADO_0
    garantia: bool = False
    color: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=50)] = None
    presupuesto: Money = Decimal("0")
    anticipo: Money = Decimal("0")
    fecha: date | None = None


class WorkOrderStatusRequest(RequestSchema):
    estado: WorkOrderStatus


class BalanceRequest(RequestSchema):
    presupuesto: Money
    anticipo: Money


class BalanceResponse(Schema):
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal


class WorkOrderStatusOption(Schema):
    value: int
    label: str


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
    cliente: UserSummary
    tecnico_id: int | None
    tecnico: UserSummary | None
    marca_id: int
    marca: BrandSummary
    modelo_id: int
    modelo: DeviceModelSummary
    estado: int
    garantia: bool
    color: str | None
    presupuesto: Decimal
    anticipo: Decimal
    saldo: Decimal
    fecha: date

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]


class WorkOrderResponse(WorkOrderListItem):
    user: UserSummary
    observacion: str | None
    spare_parts: list[WorkOrderSparePartResponse]
    spare_parts_total: Decimal
    created_at: datetime
    updated_at: datetime
