from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.application.use_cases.settings import SalesGoalsUseCases
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import CurrentUser, UowDep, require_permissions
from app.presentation.api.schemas.settings import SalesGoalsRequest, SalesGoalsResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/sales-goals", response_model=SalesGoalsResponse)
def get_sales_goals(uow: UowDep, _: CurrentUser):
    """Daily sales goals used by the header emoji (every user)."""
    return SalesGoalsResponse.model_validate(SalesGoalsUseCases(uow).get())


@router.put("/sales-goals", response_model=SalesGoalsResponse)
def update_sales_goals(
    body: SalesGoalsRequest,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.SETTINGS_MANAGE))],
):
    return SalesGoalsResponse.model_validate(SalesGoalsUseCases(uow).update(body.baja, body.alta))
