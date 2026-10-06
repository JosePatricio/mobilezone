from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends

from app.application.use_cases.settings import ResetBusinessDataUseCase
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import StorageDep, UowDep, require_permissions
from app.presentation.api.schemas.settings import ResetDataRequest, ResetDataResponse

router = APIRouter(prefix="/settings", tags=["settings"])


@router.post("/reset-data", response_model=ResetDataResponse)
def reset_data(
    body: ResetDataRequest,
    uow: UowDep,
    storage: StorageDep,
    _: Annotated[User, Depends(require_permissions(Perm.SETTINGS_RESET_DATA))],
):
    return ResetDataResponse(eliminados=ResetBusinessDataUseCase(uow, storage).execute(body.confirmacion))
