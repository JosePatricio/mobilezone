from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.application.use_cases.dashboard import Grouping
from app.presentation.api.schemas.common import Schema


class PeriodStatsResponse(Schema):
    inicio: date = Field(description="Primer día del período (día, lunes de la semana, 1.º del mes o del año)")
    etiqueta: str
    ventas: int | None = Field(description="Ventas confirmadas (null sin permiso de ventas)")
    monto: Decimal | None = Field(description="Total cobrado (total_pagar)")
    ordenes: int | None = Field(description="Órdenes de trabajo recibidas (null sin permiso de órdenes)")


class DashboardChartsResponse(Schema):
    agrupacion: Grouping
    periodos: list[PeriodStatsResponse]


class DayOrdersResponse(Schema):
    fecha: date
    recibidas: int = Field(description="Órdenes recibidas ese día")
    en_proceso: int = Field(description="Órdenes que pasaron a En proceso ese día")
    finalizadas: int = Field(description="Órdenes finalizadas ese día")
