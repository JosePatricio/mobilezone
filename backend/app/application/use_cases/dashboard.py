"""Dashboard charts: sales and work orders grouped by day, week, month or year (shop time zone)."""
from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo
from decimal import Decimal
from enum import Enum

from app.application.use_cases.base import UseCase
from app.domain.repositories import UnitOfWork

MONTHS = ("Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic")


class Grouping(str, Enum):
    DIA = "dia"
    SEMANA = "semana"
    MES = "mes"
    ANIO = "anio"


# How many periods each grouping shows (ending with the current one).
PERIODS: dict[Grouping, int] = {Grouping.DIA: 14, Grouping.SEMANA: 12, Grouping.MES: 12, Grouping.ANIO: 5}


@dataclass
class PeriodStats:
    inicio: date
    etiqueta: str
    ventas: int | None = None  # confirmed sales (None = not visible to the user)
    monto: Decimal | None = None  # amount charged (total_pagar)
    ordenes: int | None = None  # work orders received


def _start_of(day: date, grouping: Grouping) -> date:
    if grouping is Grouping.SEMANA:
        return day - timedelta(days=day.weekday())  # Monday
    if grouping is Grouping.MES:
        return day.replace(day=1)
    if grouping is Grouping.ANIO:
        return day.replace(month=1, day=1)
    return day


def _previous(start: date, grouping: Grouping) -> date:
    if grouping is Grouping.DIA:
        return start - timedelta(days=1)
    if grouping is Grouping.SEMANA:
        return start - timedelta(weeks=1)
    if grouping is Grouping.MES:
        return (start - timedelta(days=1)).replace(day=1)
    return start.replace(year=start.year - 1)


def _label(start: date, grouping: Grouping) -> str:
    if grouping is Grouping.DIA:
        return start.strftime("%d/%m")
    if grouping is Grouping.SEMANA:
        return f"Sem {start.strftime('%d/%m')}"
    if grouping is Grouping.MES:
        return f"{MONTHS[start.month - 1]} {start.year}"
    return str(start.year)


class DashboardChartsUseCase(UseCase):
    def __init__(self, uow: UnitOfWork, tz: tzinfo = timezone.utc) -> None:
        super().__init__(uow)
        self.tz = tz

    def execute(
        self, grouping: Grouping, *, sales: bool, orders: bool, today: date | None = None
    ) -> list[PeriodStats]:
        today = today or datetime.now(self.tz).date()
        starts = [_start_of(today, grouping)]
        for _ in range(PERIODS[grouping] - 1):
            starts.insert(0, _previous(starts[0], grouping))
        periods = {s: PeriodStats(inicio=s, etiqueta=_label(s, grouping)) for s in starts}
        first, end = starts[0], today + timedelta(days=1)

        if sales:
            for stats in periods.values():
                stats.ventas, stats.monto = 0, Decimal("0.00")
            since = datetime.combine(first, time.min, self.tz)
            until = datetime.combine(end, time.min, self.tz)
            for fecha, total in self.uow.sales.confirmed_totals(desde=since, hasta=until):
                stats = periods.get(_start_of(fecha.astimezone(self.tz).date(), grouping))
                if stats is not None:  # rows outside the periods shown are skipped
                    stats.ventas += 1  # type: ignore[operator]
                    stats.monto += total  # type: ignore[operator]
        if orders:
            for stats in periods.values():
                stats.ordenes = 0
            for fecha in self.uow.work_orders.reception_dates(desde=first, hasta=today):
                stats = periods.get(_start_of(fecha, grouping))
                if stats is not None:
                    stats.ordenes += 1  # type: ignore[operator]
        return list(periods.values())


@dataclass
class DayOrders:
    fecha: date
    recibidas: int
    en_proceso: int
    finalizadas: int


class DayOrdersUseCase(UseCase):
    """Work orders of one day (shop time zone): received that day, and moved to En proceso /
    Finalizado that day (from the status history)."""

    def __init__(self, uow: UnitOfWork, tz: tzinfo = timezone.utc) -> None:
        super().__init__(uow)
        self.tz = tz

    def execute(self, day: date | None = None) -> DayOrders:
        day = day or datetime.now(self.tz).date()
        since = datetime.combine(day, time.min, self.tz)
        until = datetime.combine(day + timedelta(days=1), time.min, self.tz)
        recibidas, en_proceso, finalizadas = self.uow.work_orders.day_activity(day=day, desde=since, hasta=until)
        return DayOrders(fecha=day, recibidas=recibidas, en_proceso=en_proceso, finalizadas=finalizadas)
