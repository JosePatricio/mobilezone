"""Dashboard charts: sales and orders per day / week / month / year (shop time zone)."""
from __future__ import annotations

from datetime import date, datetime, timezone
from decimal import Decimal
from types import SimpleNamespace
from zoneinfo import ZoneInfo

from app.application.use_cases.dashboard import DashboardChartsUseCase, Grouping
from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v12 import _order_body

API = "/api/v1"
GYE = ZoneInfo("America/Guayaquil")  # UTC-5


def _use_case(sales=(), orders=()):
    uow = SimpleNamespace(
        sales=SimpleNamespace(confirmed_totals=lambda desde, hasta: list(sales)),
        work_orders=SimpleNamespace(reception_dates=lambda desde, hasta: list(orders)),
    )
    return DashboardChartsUseCase(uow, GYE)  # type: ignore[arg-type]


# ------------------------------------------------------------ pure grouping
def test_days_use_the_shop_time_zone():
    sales = [
        (datetime(2026, 10, 8, 3, 0, tzinfo=timezone.utc), Decimal("10.00")),  # 7 Oct 22:00 local
        (datetime(2026, 10, 8, 15, 0, tzinfo=timezone.utc), Decimal("5.50")),
    ]
    periods = _use_case(sales, [date(2026, 10, 8)]).execute(Grouping.DIA, sales=True, orders=True, today=date(2026, 10, 8))
    assert len(periods) == 14 and periods[-1].inicio == date(2026, 10, 8) and periods[0].inicio == date(2026, 9, 25)
    assert (periods[-2].etiqueta, periods[-2].ventas, periods[-2].monto) == ("07/10", 1, Decimal("10.00"))
    assert (periods[-1].ventas, periods[-1].monto, periods[-1].ordenes) == (1, Decimal("5.50"), 1)
    assert periods[0].ventas == 0 and periods[0].ordenes == 0  # empty periods are filled with 0


def test_weeks_months_and_years():
    today = date(2026, 10, 8)  # Thursday
    orders = [date(2026, 10, 5), date(2026, 10, 8), date(2026, 9, 30), date(2025, 11, 2)]
    weeks = _use_case(orders=orders).execute(Grouping.SEMANA, sales=False, orders=True, today=today)
    assert len(weeks) == 12 and weeks[-1].inicio == date(2026, 10, 5) and weeks[-1].etiqueta == "Sem 05/10"
    assert weeks[-1].ordenes == 2 and weeks[-2].ordenes == 1
    assert weeks[-1].ventas is None and weeks[-1].monto is None  # sales not requested

    months = _use_case(orders=orders).execute(Grouping.MES, sales=False, orders=True, today=today)
    assert [m.etiqueta for m in months[-2:]] == ["Sep 2026", "Oct 2026"]
    assert months[0].inicio == date(2025, 11, 1) and months[0].ordenes == 1
    assert months[-1].ordenes == 2 and months[-2].ordenes == 1

    years = _use_case(orders=orders).execute(Grouping.ANIO, sales=False, orders=True, today=today)
    assert [y.etiqueta for y in years] == ["2022", "2023", "2024", "2025", "2026"]
    assert (years[-2].ordenes, years[-1].ordenes) == (1, 3)


# ------------------------------------------------------------------- API
def test_charts_count_sales_and_orders(client, admin_headers, factory):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers)
    client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "EFECTIVO", "monto_recibido": "50.00"},
        headers=admin_headers,
    )

    for grouping in ("dia", "semana", "mes", "anio"):
        response = client.get(f"{API}/dashboard/charts", params={"agrupacion": grouping}, headers=admin_headers)
        assert response.status_code == 200, response.text
        current = response.json()["periodos"][-1]
        assert (current["ventas"], current["monto"], current["ordenes"]) == (1, "50.00", 2), grouping


def test_charts_respect_permissions(client, factory):
    tech = factory.user(SystemRole.TECNICO)  # affiliate: no sales, no orders
    assert client.get(f"{API}/dashboard/charts", headers=auth_headers(client, tech.email)).status_code == 403

    seller = factory.user(SystemRole.VENDEDOR)  # sees both
    body = client.get(f"{API}/dashboard/charts", headers=auth_headers(client, seller.email)).json()
    assert body["agrupacion"] == "dia" and body["periodos"][-1]["ventas"] == 0
    assert client.get(f"{API}/dashboard/charts", params={"agrupacion": "hora"}, headers=auth_headers(client, seller.email)).status_code == 422
