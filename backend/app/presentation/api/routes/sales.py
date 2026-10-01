from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.application.dto import ClientData, ConfirmSaleData, SaleItemData, UpdateSaleData
from app.application.use_cases.sales import (
    CancelSaleUseCase,
    ConfirmSaleUseCase,
    GetSaleReceiptUseCase,
    SaleQueries,
    UpdateSaleUseCase,
)
from app.application.use_cases.users import ClientUseCases
from app.domain.entities import User
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import PageDep, ReceiptRendererDep, UowDep, require_permissions
from app.presentation.api.schemas.common import PageResponse
from app.presentation.api.schemas.sales import CreateSaleRequest, SaleResponse, UpdateSaleRequest
from app.presentation.api.schemas.users import ClientRequest, ClientResponse

router = APIRouter(prefix="/sales", tags=["sales"])


def _items(body) -> list[SaleItemData]:
    return [SaleItemData(inventory_id=i.inventory_id, cantidad=i.cantidad) for i in body.items]

CanView = Annotated[User, Depends(require_permissions(Perm.SALES_VIEW))]


@router.get("", response_model=PageResponse[SaleResponse])
def list_sales(
    uow: UowDep,
    page: PageDep,
    _: CanView,
    user_id: int | None = None,
    estado: SaleStatus | None = None,
    fecha_desde: date | None = None,
    fecha_hasta: date | None = None,
):
    result = SaleQueries(uow).list(page, user_id, estado, fecha_desde, fecha_hasta)
    return PageResponse[SaleResponse].from_page(result, SaleResponse)


@router.get("/customers/lookup", response_model=ClientResponse)
def lookup_customer(
    identificacion: str,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.SALES_CREATE))],
):
    """Finds an active client by cedula / RUC for the sale (sellers do not need the Clientes module)."""
    return ClientResponse.model_validate(ClientUseCases(uow).find_by_identificacion(identificacion))


@router.post("/customers", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_customer(
    body: ClientRequest,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.SALES_CREATE))],
):
    """Registers a new client (role CLIENTE, no password) from the sales screen.

    Sellers do not need access to the Usuarios / Clientes modules for this.
    """
    return ClientResponse.model_validate(ClientUseCases(uow).create(ClientData(**body.model_dump())))


@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(sale_id: int, uow: UowDep, _: CanView):
    return SaleResponse.model_validate(SaleQueries(uow).get(sale_id))


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
def confirm_sale(
    body: CreateSaleRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.SALES_CREATE))],
):
    data = ConfirmSaleData(
        branch_id=body.branch_id,
        items=_items(body),
        metodo_pago=body.metodo_pago,
        monto_recibido=body.monto_recibido,
        factura=body.factura,
        cliente_id=body.cliente_id,
    )
    return SaleResponse.model_validate(ConfirmSaleUseCase(uow).execute(data, actor))


@router.put("/{sale_id}", response_model=SaleResponse)
def update_sale(
    sale_id: int,
    body: UpdateSaleRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.SALES_UPDATE))],
):
    """Modifies a confirmed sale (returns / changes). Stock is reconciled per branch inventory."""
    data = UpdateSaleData(
        items=_items(body),
        metodo_pago=body.metodo_pago,
        monto_recibido=body.monto_recibido,
        factura=body.factura,
        cliente_id=body.cliente_id,
    )
    return SaleResponse.model_validate(UpdateSaleUseCase(uow).execute(sale_id, data, actor))


@router.get("/{sale_id}/receipt", response_class=Response, responses={200: {"content": {"application/pdf": {}}}})
def sale_receipt(sale_id: int, uow: UowDep, renderer: ReceiptRendererDep, _: CanView):
    """PDF receipt (comprobante) of the sale."""
    pdf = GetSaleReceiptUseCase(uow, renderer).execute(sale_id)
    return Response(
        pdf,
        media_type="application/pdf",
        headers={"Content-Disposition": f'inline; filename="comprobante-{sale_id:06d}.pdf"'},
    )


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
def cancel_sale(
    sale_id: int, uow: UowDep, actor: Annotated[User, Depends(require_permissions(Perm.SALES_CANCEL))]
):
    return SaleResponse.model_validate(CancelSaleUseCase(uow).execute(sale_id, actor))
