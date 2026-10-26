"""Dashboard charts: sales and work orders grouped by day, week, month or year (shop time zone)."""
from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta, timezone, tzinfo
from decimal import Decimal
from enum import Enum

from app.application.use_cases.base import UseCase
from app.domain.entities import WorkOrder
from app.domain.repositories import BrandOrders, TopProduct, UnitOfWork
from app.domain.value_objects.work_orders import ENTRY_REASON_LABELS, EntryReason

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


@dataclass
class LowStockProduct:
    id: int
    sku: str
    nombre: str
    stock: int  # total stock of every branch
    minimo_recomendado: int

    @property
    def faltante(self) -> int:
        return self.minimo_recomendado - self.stock


class LowStockUseCase(UseCase):
    """Active products whose total stock is below their recommended minimum (dashboard alert)."""

    def execute(self) -> list[LowStockProduct]:
        return [
            LowStockProduct(
                id=p.id,  # type: ignore[arg-type]
                sku=p.sku,
                nombre=p.nombre,
                stock=p.stock_total,
                minimo_recomendado=p.minimo_recomendado,
            )
            for p in self.uow.products.below_minimum()
        ]


TOP_LIMIT = 10  # rankings of the statistics (most sold products, brands with most orders)


class TopProductsUseCase(UseCase):
    """The 10 products with the most units sold in confirmed sales (Ventas statistics, admin)."""

    def execute(self) -> list[TopProduct]:
        return self.uow.sales.top_products(limit=TOP_LIMIT)


@dataclass
class StockValue:
    activo_neto: Decimal  # sum of PVP * total stock
    activo_bruto: Decimal  # sum of cost * total stock


class StockValueUseCase(UseCase):
    """Value of the stock of every branch at sale price and at cost (Productos summary, admin)."""

    def execute(self) -> StockValue:
        neto, bruto = self.uow.products.stock_value()
        return StockValue(activo_neto=neto, activo_bruto=bruto)


class TopBrandsUseCase(UseCase):
    """The 10 brands with the most work orders received (Órdenes statistics, admin)."""

    def execute(self) -> list[BrandOrders]:
        return self.uow.work_orders.top_brands(limit=TOP_LIMIT)


@dataclass
class EntryReasonCount:
    motivo: EntryReason
    ordenes: int

    @property
    def etiqueta(self) -> str:
        return ENTRY_REASON_LABELS[self.motivo]


class EntryReasonsUseCase(UseCase):
    """Work orders per entry reason (an order with several reasons counts in each), the most first;
    reasons never used are left out."""

    def execute(self) -> list[EntryReasonCount]:
        counts = Counter(reason for reasons in self.uow.work_orders.entry_reasons() for reason in reasons)
        # Ties keep the order of the catalog.
        ranked = sorted(counts.items(), key=lambda item: (-item[1], list(EntryReason).index(item[0])))
        return [EntryReasonCount(motivo=reason, ordenes=n) for reason, n in ranked]


class OverdueOrdersUseCase(UseCase):
    """Work orders not finalized whose promised delivery time already passed (notifications bell)."""

    def execute(self, now: datetime | None = None) -> list[WorkOrder]:
        return self.uow.work_orders.overdue(now=now or datetime.now(timezone.utc))


class DueSoonOrdersUseCase(UseCase):
    """Work orders not finalized whose promised delivery time comes within the next day, so they are
    about to be overdue (notifications bell)."""

    WINDOW = timedelta(days=1)

    def execute(self, now: datetime | None = None) -> list[WorkOrder]:
        now = now or datetime.now(timezone.utc)
        return self.uow.work_orders.due_soon(now=now, until=now + self.WINDOW)
