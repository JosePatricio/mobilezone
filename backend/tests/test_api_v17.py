"""Órdenes: reception date and time (last field of the form, defaults to now)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from tests.test_api_v12 import _order_body

API = "/api/v1"
URL = f"{API}/work-orders"


def _utc(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)


def test_reception_defaults_to_now(client, admin_headers, factory):
    before = datetime.now(timezone.utc) - timedelta(seconds=2)
    order = client.post(URL, json=_order_body(factory), headers=admin_headers).json()
    received = _utc(order["fecha_hora"])
    assert before <= received <= datetime.now(timezone.utc) + timedelta(seconds=2)


def test_reception_typed_in_local_time(client, admin_headers, factory):
    # 22:00 in Guayaquil (UTC-5) is 03:00 UTC of the next day, but the order is of the local day.
    body = _order_body(factory, fecha_hora="2026-10-01T22:00:00")
    order = client.post(URL, json=body, headers=admin_headers).json()
    assert _utc(order["fecha_hora"]) == datetime(2026, 10, 2, 3, 0, tzinfo=timezone.utc)
    assert order["fecha"] == "2026-10-01"
    listed = client.get(URL, params={"fecha_desde": "2026-10-01", "fecha_hasta": "2026-10-01"}, headers=admin_headers)
    assert [o["id"] for o in listed.json()["items"]] == [order["id"]]


def test_reception_can_be_changed_and_is_kept_otherwise(client, admin_headers, factory):
    order = client.post(URL, json=_order_body(factory, fecha_hora="2026-10-01T09:30:00"), headers=admin_headers).json()
    url = f"{URL}/{order['id']}"

    kept = client.put(url, json=_order_body(factory), headers=admin_headers).json()
    assert _utc(kept["fecha_hora"]) == datetime(2026, 10, 1, 14, 30, tzinfo=timezone.utc)

    changed = client.put(url, json=_order_body(factory, fecha_hora="2026-09-30T08:15:00-05:00"), headers=admin_headers)
    assert changed.status_code == 200, changed.text
    assert _utc(changed.json()["fecha_hora"]) == datetime(2026, 9, 30, 13, 15, tzinfo=timezone.utc)
    assert changed.json()["fecha"] == "2026-09-30"
