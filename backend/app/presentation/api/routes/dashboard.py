from __future__ import annotations

from datetime import date
from typing import Annotated
from zoneinfo import ZoneInfo

from fastapi import APIRouter, Depends, Request

from app.application.use_cases.dashboard import DashboardChartsUseCase, DayOrdersUseCase, Grouping
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import UowDep, require_any_permission, require_permissions
from app.presentation.api.schemas.dashboard import DashboardChartsResponse, DayOrdersResponse

router = APIRouter(prefix="/dashboard", tags=["dashboard"])


@router.get("/charts", response_model=DashboardChartsResponse)
def dashboard_charts(
    request: Request,
    uow: UowDep,
    actor: Annotated[User, Depends(require_any_permission(Perm.SALES_VIEW, Perm.WORK_ORDERS_VIEW))],
    agrupacion: Grouping = Grouping.DIA,
):
    """Confirmed sales (count and amount) and received work orders per day, week, month or year,
    in the shop time zone. Each part is only included with its permission (``null`` otherwise)."""
    periods = DashboardChartsUseCase(uow, ZoneInfo(request.app.state.settings.timezone)).execute(
        agrupacion,
        sales=actor.has_permission(Perm.SALES_VIEW),
        orders=actor.has_permission(Perm.WORK_ORDERS_VIEW),
    )
    return DashboardChartsResponse(agrupacion=agrupacion, periodos=periods)


@router.get("/orders-day", response_model=DayOrdersResponse)
def orders_of_the_day(
    request: Request,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_VIEW))],
    fecha: date | None = None,
):
    """Orders received, moved to En proceso and finalized on ``fecha`` (default: today, shop time zone)."""
    tz = ZoneInfo(request.app.state.settings.timezone)
    return DayOrdersResponse.model_validate(DayOrdersUseCase(uow, tz).execute(fecha))
