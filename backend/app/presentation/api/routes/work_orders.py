from __future__ import annotations

from datetime import date
from typing import Annotated

from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request, Response, UploadFile, status

from app.application.dto import ClientData, FinalizeWorkOrderData, WorkOrderClientData, WorkOrderStatusData, WorkOrderData, WorkOrderFilters, WorkOrderSparePartData
from app.application.use_cases.inventory import BranchUseCases
from app.application.use_cases.users import ClientUseCases
from app.application.use_cases.work_orders import (
    AddSparePartToWorkOrderUseCase,
    AddWorkOrderPhotoUseCase,
    PublicWorkOrderStatusUseCase,
    RemoveWorkOrderPhotoUseCase,
    CalculateWorkOrderBalanceUseCase,
    ChangeWorkOrderStatusUseCase,
    CreateWorkOrderUseCase,
    DeleteWorkOrderUseCase,
    FinalizeWorkOrderUseCase,
    RemoveSparePartFromWorkOrderUseCase,
    UpdateWorkOrderUseCase,
    WorkOrderQueries,
)
from app.domain.entities import User
from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS
from app.domain.value_objects.pagination import MAX_PAGE_SIZE, PageRequest
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import (
    CurrentUser,
    PageDep,
    StorageDep,
    UowDep,
    read_upload,
    require_any_permission,
    require_permissions,
)
from app.presentation.api.schemas.common import PageResponse
from app.presentation.api.schemas.users import ClientRequest, ClientResponse, ClientSummary
from app.presentation.api.schemas.work_orders import (
    BranchContact,
    AddWorkOrderSparePartRequest,
    BalanceRequest,
    BalanceResponse,
    FinalizeWorkOrderRequest,
    PublicWorkOrderResponse,
    WorkOrderCatalogsResponse,
    WorkOrderListItem,
    WorkOrderPhotoResponse,
    WorkOrderRequest,
    WorkOrderResponse,
    WorkOrderSparePartResponse,
    WorkOrderStatusOption,
    WorkOrderStatusRequest,
)

router = APIRouter(prefix="/work-orders", tags=["work-orders"])
public_router = APIRouter(prefix="/public/work-orders", tags=["public"])

CanView = Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_VIEW))]
CanUpdate = Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_UPDATE))]
CanEdit = Annotated[User, Depends(require_any_permission(Perm.WORK_ORDERS_CREATE, Perm.WORK_ORDERS_UPDATE))]


def _tz(request: Request) -> ZoneInfo:
    return ZoneInfo(request.app.state.settings.timezone)


def _data(body: WorkOrderRequest, tz: ZoneInfo) -> WorkOrderData:
    values = body.model_dump(mode="json", exclude={"cliente", "presupuesto", "anticipo", "fecha_entrega"})
    entrega = _local(body.fecha_entrega, tz)
    return WorkOrderData(
        **values,
        cliente=WorkOrderClientData(**body.cliente.model_dump()),
        presupuesto=body.presupuesto,
        anticipo=body.anticipo,
        fecha_entrega=entrega,
    )


@router.get("/catalogs", response_model=WorkOrderCatalogsResponse)
def list_catalogs(_: CurrentUser):
    """Options of the order form: entry reasons, display types, warranty, lock types and statuses."""
    return WorkOrderCatalogsResponse.build()


@router.get("/branches", response_model=list[BranchContact])
def list_order_branches(uow: UowDep, _: CanEdit):
    """Active branches (locales) for the order form (does not require ``inventory.view``)."""
    result = BranchUseCases(uow).list(PageRequest(1, MAX_PAGE_SIZE), estado=True)
    return [BranchContact.model_validate(b) for b in result.items]


@router.get("/customers/lookup", response_model=ClientSummary)
def lookup_customer(identificacion: str, uow: UowDep, _: CanEdit):
    """Client by cédula / RUC to fill the order form (404 = new client, typed in the form)."""
    return ClientSummary.model_validate(ClientUseCases(uow).find_by_identificacion(identificacion))


@router.post("/customers", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_customer(body: ClientRequest, uow: UowDep, _: CanEdit):
    """Registers a new client (role CLIENTE, no password) from the work order screen."""
    return ClientResponse.model_validate(ClientUseCases(uow).create(ClientData(**body.model_dump())))


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
    request: Request,
    body: WorkOrderRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_CREATE))],
):
    """The logged user is the technician; the order date is today (shop time zone)."""
    tz = _tz(request)
    return WorkOrderResponse.model_validate(CreateWorkOrderUseCase(uow, tz).execute(_data(body, tz), actor))


@router.put("/{work_order_id}", response_model=WorkOrderResponse)
def update_work_order(request: Request, work_order_id: int, body: WorkOrderRequest, uow: UowDep, actor: CanUpdate):
    order = UpdateWorkOrderUseCase(uow).execute(work_order_id, _data(body, _tz(request)), actor)
    return WorkOrderResponse.model_validate(order)



@router.delete("/{work_order_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_work_order(
    work_order_id: int,
    uow: UowDep,
    storage: StorageDep,
    _: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_DELETE))],
) -> Response:
    """Deletes the order completely (photos, spare parts, history and the sale of a finalized order)."""
    DeleteWorkOrderUseCase(uow, storage).execute(work_order_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


def _local(value, tz: ZoneInfo):
    """A date-time without offset is the local time of the shop."""
    return value.replace(tzinfo=tz) if value is not None and value.tzinfo is None else value


@router.patch("/{work_order_id}/status", response_model=WorkOrderResponse)
def change_work_order_status(
    request: Request, work_order_id: int, body: WorkOrderStatusRequest, uow: UowDep, actor: CanUpdate
):
    """Recibido / En proceso (requires the approximate delivery time). Recorded in the history."""
    data = WorkOrderStatusData(int(body.estado), body.observacion, _local(body.fecha_entrega, _tz(request)))
    return WorkOrderResponse.model_validate(ChangeWorkOrderStatusUseCase(uow).execute(work_order_id, data, actor))


@router.post("/{work_order_id}/finalize", response_model=WorkOrderResponse)
def finalize_work_order(work_order_id: int, body: FinalizeWorkOrderRequest, uow: UowDep, actor: CanUpdate):
    """Finalizado: the order is closed (no more changes) and the sale of the repair is registered
    (total = repair cost; the anticipo counts as paid). It appears in the sales module."""
    order, _sale = FinalizeWorkOrderUseCase(uow).execute(
        work_order_id, FinalizeWorkOrderData(**body.model_dump()), actor
    )
    return WorkOrderResponse.model_validate(order)


@router.post(
    "/{work_order_id}/photos", response_model=WorkOrderPhotoResponse, status_code=status.HTTP_201_CREATED
)
def add_photo(work_order_id: int, file: UploadFile, uow: UowDep, storage: StorageDep, _: CanEdit):
    """Photo of the device (JPG, PNG or WEBP, max 2 MB). Up to 3 per order."""
    content = read_upload(file)
    return WorkOrderPhotoResponse.model_validate(AddWorkOrderPhotoUseCase(uow, storage).execute(work_order_id, content))


@router.delete("/{work_order_id}/photos/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def remove_photo(work_order_id: int, photo_id: int, uow: UowDep, storage: StorageDep, _: CanEdit) -> Response:
    RemoveWorkOrderPhotoUseCase(uow, storage).execute(work_order_id, photo_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/{codigo}", response_model=PublicWorkOrderResponse)
def public_work_order_status(codigo: str, uow: UowDep):
    """Public status page opened from the QR of the order. No authentication; limited data."""
    return PublicWorkOrderResponse.model_validate(PublicWorkOrderStatusUseCase(uow).execute(codigo))


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
