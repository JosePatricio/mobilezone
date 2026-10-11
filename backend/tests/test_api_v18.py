"""Ventas: daily cash opening (apertura de caja) — branch where the seller works and starting cash."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"
URL = f"{API}/sales/cash-opening"


def test_seller_opens_the_register_once_a_day(client, factory):
    seller = factory.user()
    headers = auth_headers(client, seller.email)

    pending = client.get(f"{URL}/today", headers=headers)
    assert pending.status_code == 200, pending.text
    assert pending.json() is None

    body = {"branch_id": factory.default_branch.id, "monto_inicial": "25.50"}
    opened = client.post(URL, json=body, headers=headers)
    assert opened.status_code == 201, opened.text
    data = opened.json()
    assert data["user_id"] == seller.id
    assert data["branch"] == {"id": factory.default_branch.id, "nombre": "Matriz"}
    assert data["monto_inicial"] == "25.50"

    today = client.get(f"{URL}/today", headers=headers).json()
    assert today["id"] == data["id"] and today["fecha"] == data["fecha"]

    again = client.post(URL, json=body, headers=headers)
    assert again.status_code == 409
    assert again.json()["error"]["code"] == "CASH_ALREADY_OPENED"


def test_each_seller_opens_their_own_register(client, factory):
    first, second = factory.user(), factory.user()
    body = {"branch_id": factory.default_branch.id, "monto_inicial": "10"}
    assert client.post(URL, json=body, headers=auth_headers(client, first.email)).status_code == 201
    assert client.get(f"{URL}/today", headers=auth_headers(client, second.email)).json() is None


def test_branch_must_be_assigned_and_active(client, factory):
    other = factory.branch()
    inactive = factory.branch(estado=False)
    seller = factory.user(branches=[factory.default_branch, inactive])
    headers = auth_headers(client, seller.email)

    response = client.post(URL, json={"branch_id": other.id, "monto_inicial": "5"}, headers=headers)
    assert response.status_code == 403
    assert response.json()["error"]["code"] == "BRANCH_NOT_ASSIGNED"

    response = client.post(URL, json={"branch_id": inactive.id, "monto_inicial": "5"}, headers=headers)
    assert response.status_code in (400, 422)
    assert response.json()["error"]["code"] == "INVALID_BRANCH"


def test_starting_cash_cannot_be_negative(client, factory):
    headers = auth_headers(client, factory.user().email)
    response = client.post(URL, json={"branch_id": factory.default_branch.id, "monto_inicial": "-1"}, headers=headers)
    assert response.status_code == 422


def test_requires_permission_to_sell(client, factory):
    tech = factory.user(SystemRole.TECNICO)
    headers = auth_headers(client, tech.email)
    assert client.get(f"{URL}/today", headers=headers).status_code == 403
