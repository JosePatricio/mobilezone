from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.application.dto import WorkOrderData, WorkOrderFilters, WorkOrderSparePartData
from app.application.use_cases.work_orders import (
    AddSparePartToWorkOrderUseCase,
    CalculateWorkOrderBalanceUseCase,
    ChangeWorkOrderStatusUseCase,
    CreateWorkOrderUseCase,
    RemoveSparePartFromWorkOrderUseCase,
    UpdateWorkOrderUseCase,
    WorkOrderQueries,
)
from app.domain.entities import User
from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import CurrentUser, PageDep, UowDep, require_permissions
from app.presentation.api.schemas.common import PageResponse
from app.presentation.api.schemas.work_orders import (
    AddWorkOrderSparePartRequest,
    BalanceRequest,
    BalanceResponse,
    WorkOrderListItem,
    WorkOrderRequest,
    WorkOrderResponse,
    WorkOrderSparePartResponse,
    WorkOrderStatusOption,
    WorkOrderStatusRequest,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])

CanView = Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_VIEW))]
CanUpdate = Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_UPDATE))]


def _data(body: WorkOrderRequest) -> WorkOrderData:
    return WorkOrderData(**{**body.model_dump(), "estado": int(body.estado)})


@router.get("/statuses", response_model=list[WorkOrderStatusOption])
def list_statuses(_: CurrentUser):
    """Single source of truth for status labels (meaning still pending in the spec)."""
    return [WorkOrderStatusOption(value=int(s), label=label) for s, label in WORK_ORDER_STATUS_LABELS.items()]


@router.post("/calculate-balance", response_model=BalanceResponse)
def calculate_balance(body: BalanceRequest, _: CurrentUser):
    result = CalculateWorkOrderBalanceUseCase().execute(body.presupuesto, body.anticipo)
    return BalanceResponse.model_validate(result)


@router.get("", response_model=PageResponse[WorkOrderListItem])
def list_work_orders(
    uow: UowDep,
    page: PageDep,
    _: CanView,
    num_orden: int | None = None,
    cliente: str | None = None,
    cliente_id: int | None = None,
    tecnico_id: int | None = None,
    estado: int | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
):
    filters = WorkOrderFilters(num_orden, cliente, cliente_id, tecnico_id, estado, fecha_desde, fecha_hasta)
    result = WorkOrderQueries(uow).list(page, filters)
    return PageResponse[WorkOrderListItem].from_page(result, WorkOrderListItem)


@router.get("/by-number/{num_orden}", response_model=WorkOrderResponse)
def get_work_order_by_number(num_orden: int, uow: UowDep, _: CanView):
    return WorkOrderResponse.model_validate(WorkOrderQueries(uow).get_by_num_orden(num_orden))


@router.get("/{work_order_id}", response_model=WorkOrderResponse)
def get_work_order(work_order_id: int, uow: UowDep, _: CanView):
    return WorkOrderResponse.model_validate(WorkOrderQueries(uow).get(work_order_id))


@router.post("", response_model=WorkOrderResponse, status_code=status.HTTP_201_CREATED)
def create_work_order(
    body: WorkOrderRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_CREATE))],
):
    return WorkOrderResponse.model_validate(CreateWorkOrderUseCase(uow).execute(_data(body), actor))


@router.put("/{work_order_id}", response_model=WorkOrderResponse)
def update_work_order(work_order_id: int, body: WorkOrderRequest, uow: UowDep, actor: CanUpdate):
    return WorkOrderResponse.model_validate(UpdateWorkOrderUseCase(uow).execute(work_order_id, _data(body), actor))


@router.patch("/{work_order_id}/status", response_model=WorkOrderResponse)
def change_work_order_status(work_order_id: int, body: WorkOrderStatusRequest, uow: UowDep, _: CanUpdate):
    order = ChangeWorkOrderStatusUseCase(uow).execute(work_order_id, int(body.estado))
    return WorkOrderResponse.model_validate(order)


@router.post(
    "/{work_order_id}/spare-parts",
    response_model=WorkOrderSparePartResponse,
    status_code=status.HTTP_201_CREATED,
)
def add_spare_part(
    work_order_id: int,
    body: AddWorkOrderSparePartRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_SPARE_PARTS_ADD))],
):
    item = AddSparePartToWorkOrderUseCase(uow).execute(
        work_order_id, WorkOrderSparePartData(**body.model_dump()), actor
    )
    return WorkOrderSparePartResponse.model_validate(item)


@router.delete("/{work_order_id}/spare-parts/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_spare_part(
    work_order_id: int,
    item_id: int,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_SPARE_PARTS_REMOVE))],
) -> Response:
    RemoveSparePartFromWorkOrderUseCase(uow).execute(work_order_id, item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
