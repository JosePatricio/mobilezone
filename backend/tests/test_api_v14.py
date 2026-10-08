"""Usuarios: delete a user. Its sales and orders are listed first and reassigned to another user."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v12 import _order_body

API = "/api/v1"


def _seller_with_sale_and_order(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=headers).json()
    finalized = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "TRANSFERENCIA"},
        headers=headers,
    )
    assert finalized.status_code == 200, finalized.text
    return seller, order, finalized.json()["sale"]


def _admin_id(client, admin_headers) -> int:
    return client.get(f"{API}/auth/me", headers=admin_headers).json()["user"]["id"]


def test_delete_user_without_records(client, admin_headers, factory):
    user = factory.user(SystemRole.TECNICO)
    usage = client.get(f"{API}/users/{user.id}/usage", headers=admin_headers).json()
    assert usage["has_records"] is False and usage["ventas"] == [] and usage["ordenes"] == []

    assert client.delete(f"{API}/users/{user.id}", headers=admin_headers).status_code == 204
    assert client.get(f"{API}/users/{user.id}", headers=admin_headers).status_code == 404


def test_user_with_sales_and_orders_is_reassigned(client, admin_headers, factory):
    seller, order, sale = _seller_with_sale_and_order(client, factory)

    usage = client.get(f"{API}/users/{seller.id}/usage", headers=admin_headers).json()
    assert usage["has_records"] is True
    assert usage["ventas_total"] == 1 and usage["ventas"][0]["id"] == sale["id"]
    assert usage["ventas"][0]["rol"] == "Vendedor" and usage["ventas"][0]["total_pagar"] == "50.00"
    assert usage["ordenes_total"] == 1 and usage["ordenes"][0]["num_orden"] == order["num_orden"]
    assert usage["ordenes"][0]["rol"] == "Registró" and usage["ordenes"][0]["estado_label"] == "Finalizado"

    # Without choosing who receives the records the user is not deleted.
    blocked = client.delete(f"{API}/users/{seller.id}", headers=admin_headers)
    assert blocked.status_code == 409 and blocked.json()["error"]["code"] == "USER_HAS_RECORDS"

    admin_id = _admin_id(client, admin_headers)
    deleted = client.delete(f"{API}/users/{seller.id}", params={"reassign_to": admin_id}, headers=admin_headers)
    assert deleted.status_code == 204, deleted.text
    assert client.get(f"{API}/users/{seller.id}", headers=admin_headers).status_code == 404

    moved_order = client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()
    assert moved_order["user"]["id"] == admin_id and moved_order["tecnico"]["id"] == admin_id
    assert all(change["user"]["id"] == admin_id for change in moved_order["status_changes"])
    assert client.get(f"{API}/sales/{sale['id']}", headers=admin_headers).json()["user_id"] == admin_id


def test_client_records_go_to_another_client(client, admin_headers, factory):
    _, order, _ = _seller_with_sale_and_order(client, factory)
    customer_id = order["cliente_id"]
    other_customer = factory.user(SystemRole.CLIENTE)

    usage = client.get(f"{API}/users/{customer_id}/usage", headers=admin_headers).json()
    assert usage["ventas"][0]["rol"] == "Cliente" and usage["ordenes"][0]["rol"] == "Cliente"

    wrong = client.delete(
        f"{API}/users/{customer_id}", params={"reassign_to": _admin_id(client, admin_headers)}, headers=admin_headers
    )
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "INVALID_REASSIGN_USER"

    ok = client.delete(f"{API}/users/{customer_id}", params={"reassign_to": other_customer.id}, headers=admin_headers)
    assert ok.status_code == 204, ok.text
    assert client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()["cliente_id"] == other_customer.id


def test_delete_rules(client, admin_headers, factory):
    admin_id = _admin_id(client, admin_headers)
    own = client.delete(f"{API}/users/{admin_id}", headers=admin_headers)
    assert own.status_code == 400 and own.json()["error"]["code"] == "CANNOT_DELETE_SELF"

    seller = factory.user(SystemRole.VENDEDOR)
    target = factory.user(SystemRole.TECNICO)
    assert client.delete(f"{API}/users/{target.id}", headers=auth_headers(client, seller.email)).status_code == 403
    assert client.get(f"{API}/users/{target.id}/usage", headers=auth_headers(client, seller.email)).status_code == 403
