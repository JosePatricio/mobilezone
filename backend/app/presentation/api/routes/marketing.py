from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.application.use_cases.marketing import OrderClientsQuery
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import UowDep, require_permissions
from app.presentation.api.schemas.marketing import OrderClientResponse

router = APIRouter(prefix="/marketing", tags=["marketing"])


@router.get("/recipients", response_model=list[OrderClientResponse])
def order_clients(
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.MARKETING_MANAGE))],
    search: str | None = None,
    marca_id: int | None = None,
):
    """Recipients of the CRM messages: active clients with at least one work order (clients that
    only bought in Ventas are left out), with the brand of the phone of their most recent order."""
    return OrderClientsQuery(uow).execute(search=search, marca_id=marca_id)
