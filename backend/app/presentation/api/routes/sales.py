from __future__ import annotations

from datetime import date
from typing import Annotated

from fastapi import APIRouter, Depends, status

from app.application.dto import SaleItemData
from app.application.use_cases.sales import CancelSaleUseCase, ConfirmSaleUseCase, SaleQueries
from app.domain.entities import User
from app.domain.value_objects.enums import SaleStatus
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import PageDep, UowDep, require_permissions
from app.presentation.api.schemas.common import PageResponse
from app.presentation.api.schemas.sales import CreateSaleRequest, SaleResponse

router = APIRouter(prefix="/sales", tags=["sales"])

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


@router.get("/{sale_id}", response_model=SaleResponse)
def get_sale(sale_id: int, uow: UowDep, _: CanView):
    return SaleResponse.model_validate(SaleQueries(uow).get(sale_id))


@router.post("", response_model=SaleResponse, status_code=status.HTTP_201_CREATED)
def confirm_sale(
    body: CreateSaleRequest,
    uow: UowDep,
    actor: Annotated[User, Depends(require_permissions(Perm.SALES_CREATE))],
):
    items = [SaleItemData(product_id=i.product_id, cantidad=i.cantidad) for i in body.items]
    return SaleResponse.model_validate(ConfirmSaleUseCase(uow).execute(items, actor))


@router.post("/{sale_id}/cancel", response_model=SaleResponse)
def cancel_sale(
    sale_id: int, uow: UowDep, actor: Annotated[User, Depends(require_permissions(Perm.SALES_CANCEL))]
):
    return SaleResponse.model_validate(CancelSaleUseCase(uow).execute(sale_id, actor))
