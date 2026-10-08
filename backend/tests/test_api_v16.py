"""Metas de venta (header emoji), Perfil (own data) and orders of the day in the dashboard."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v12 import _order_body

API = "/api/v1"
GOALS = f"{API}/settings/sales-goals"


# ------------------------------------------------------------- sales goals
def test_sales_goals_default_and_update(client, admin_headers, factory):
    seller_headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
    assert client.get(GOALS, headers=seller_headers).json() == {"baja": "20.00", "alta": "50.00"}

    updated = client.put(GOALS, json={"baja": "30", "alta": "80.5"}, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert client.get(GOALS, headers=seller_headers).json() == {"baja": "30.00", "alta": "80.50"}


def test_sales_goals_rules(client, admin_headers, factory):
    wrong = client.put(GOALS, json={"baja": "50", "alta": "20"}, headers=admin_headers)
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "INVALID_SALES_GOALS"
    seller_headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
    assert client.put(GOALS, json={"baja": "1", "alta": "2"}, headers=seller_headers).status_code == 403
    assert client.get(GOALS).status_code == 401


# ------------------------------------------------------------------ profile
def test_user_updates_own_profile(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    body = {
        "nombre": "Vera",
        "apellido": "Ruiz",
        "email": "vera.ruiz@example.com",
        "celular": "0991112222",
        "provincia": "Pichincha",
        "ciudad": "Quito",
        "direccion": "Av. Amazonas N24-12",
    }
    response = client.put(f"{API}/auth/me", json=body, headers=headers)
    assert response.status_code == 200, response.text
    data = response.json()
    assert (data["nombre"], data["email"], data["direccion"]) == ("Vera", "vera.ruiz@example.com", "Av. Amazonas N24-12")
    # Role and branches are kept (only the administrator changes them).
    assert data["role"]["nombre"] == "VENDEDOR" and len(data["branches"]) == 1
    assert client.get(f"{API}/auth/me", headers=headers).json()["user"]["celular"] == "0991112222"


def test_profile_rejects_role_changes_and_used_emails(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    other = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    base = {"nombre": "A", "apellido": "B", "email": other.email}
    taken = client.put(f"{API}/auth/me", json=base, headers=headers)
    assert taken.status_code == 409 and taken.json()["error"]["code"] == "EMAIL_ALREADY_EXISTS"
    extra = client.put(f"{API}/auth/me", json={**base, "email": seller.email, "rol_id": 1}, headers=headers)
    assert extra.status_code == 422  # rol_id is not a profile field


def test_profile_photo(client, factory):
    from tests.test_api_v5 import _png

    headers = auth_headers(client, factory.user(SystemRole.TECNICO).email)
    uploaded = client.put(f"{API}/auth/me/photo", files=_png(), headers=headers)
    assert uploaded.status_code == 200 and uploaded.json()["foto_url"].startswith("/media/users/")
    assert client.delete(f"{API}/auth/me/photo", headers=headers).json()["foto_url"] is None


# ------------------------------------------------------------ orders of the day
def test_orders_of_the_day(client, admin_headers, factory):
    first = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    second = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers)
    client.patch(
        f"{API}/work-orders/{first['id']}/status",
        json={"estado": 1, "fecha_entrega": "2026-12-01T10:00:00"},
        headers=admin_headers,
    )
    client.post(
        f"{API}/work-orders/{second['id']}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "TRANSFERENCIA"},
        headers=admin_headers,
    )

    today = client.get(f"{API}/dashboard/orders-day", headers=admin_headers).json()
    assert (today["recibidas"], today["en_proceso"], today["finalizadas"]) == (3, 1, 1)
    other_day = client.get(f"{API}/dashboard/orders-day", params={"fecha": "2020-01-01"}, headers=admin_headers).json()
    assert (other_day["fecha"], other_day["recibidas"], other_day["en_proceso"]) == ("2020-01-01", 0, 0)

    tech = factory.user(SystemRole.TECNICO)
    assert client.get(f"{API}/dashboard/orders-day", headers=auth_headers(client, tech.email)).status_code == 403
