"""Campana de notificaciones: work orders not finalized whose delivery time already passed (atrasadas)."""
from __future__ import annotations

from datetime import datetime, timedelta, timezone

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"


def _order_body(factory, **overrides):
    customer = factory.user(SystemRole.CLIENTE)
    brand, model = factory.brand_and_model()
    body = {
        "cliente": {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "motivo_ingreso": "PANTALLA",
        "presupuesto": "50.00",
        "anticipo": "0.00",
    }
    return {**body, **overrides}


def _iso(delta: timedelta) -> str:
    return (datetime.now(timezone.utc) + delta).isoformat()


def _create(client, headers, factory, **overrides) -> dict:
    response = client.post(f"{API}/work-orders", json=_order_body(factory, **overrides), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_overdue_orders_lists_not_finalized_orders_past_their_delivery(client, admin_headers, factory):
    late = _create(client, admin_headers, factory, fecha_entrega=_iso(timedelta(hours=-2)))
    very_late = _create(client, admin_headers, factory, fecha_entrega=_iso(timedelta(days=-3)))
    _create(client, admin_headers, factory, fecha_entrega=_iso(timedelta(hours=5)))  # still on time
    _create(client, admin_headers, factory)  # no delivery date
    finalized = _create(client, admin_headers, factory, fecha_entrega=_iso(timedelta(days=-1)))
    done = client.post(
        f"{API}/work-orders/{finalized['id']}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "TRANSFERENCIA"},
        headers=admin_headers,
    )
    assert done.status_code == 200, done.text

    response = client.get(f"{API}/dashboard/overdue-orders", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert [o["id"] for o in response.json()] == [very_late["id"], late["id"]]
    assert {"num_orden", "cliente", "marca", "modelo", "fecha_entrega"} <= set(response.json()[0])


def test_overdue_orders_requires_work_orders_view(client, factory):
    tech = factory.user(SystemRole.TECNICO)
    seller = factory.user(SystemRole.VENDEDOR)
    for user in (tech, seller):
        headers = auth_headers(client, user.email)
        can_view = client.get(f"{API}/work-orders", headers=headers).status_code == 200
        expected = 200 if can_view else 403
        assert client.get(f"{API}/dashboard/overdue-orders", headers=headers).status_code == expected
