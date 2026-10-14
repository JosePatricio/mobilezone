"""Propaganda (CRM): the recipients are the clients that came through Órdenes, with the brand
of the phone of their most recent order; clients that only bought in Ventas are left out."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v12 import _order_body

API = "/api/v1"


def _order(client, headers, factory, customer=None, brand_model=None):
    customer = customer or factory.user(SystemRole.CLIENTE)
    brand, model = brand_model or factory.brand_and_model()
    body = _order_body(
        factory,
        cliente={"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        marca_id=brand.id,
        modelo_id=model.id,
    )
    response = client.post(f"{API}/work-orders", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return customer, brand, model


def test_recipients_are_only_the_clients_with_work_orders(client, admin_headers, factory):
    with_order, brand, model = _order(client, admin_headers, factory)
    factory.user(SystemRole.CLIENTE)  # a client without orders (e.g. only bought in Ventas)

    response = client.get(f"{API}/marketing/recipients", headers=admin_headers)
    assert response.status_code == 200, response.text
    rows = response.json()
    assert [r["cliente_id"] for r in rows] == [with_order.id]
    assert (rows[0]["nombre"], rows[0]["marca"], rows[0]["modelo"], rows[0]["ordenes"]) == (
        with_order.nombre, brand.nombre, model.nombre, 1
    )


def test_recipient_takes_the_phone_of_the_most_recent_order(client, admin_headers, factory):
    customer, _, _ = _order(client, admin_headers, factory)
    _, latest_brand, _ = _order(client, admin_headers, factory, customer=customer)

    rows = client.get(f"{API}/marketing/recipients", headers=admin_headers).json()
    assert [(r["cliente_id"], r["marca"], r["ordenes"]) for r in rows] == [(customer.id, latest_brand.nombre, 2)]

    by_brand = client.get(f"{API}/marketing/recipients", params={"marca_id": latest_brand.id}, headers=admin_headers)
    assert [r["cliente_id"] for r in by_brand.json()] == [customer.id]
    other = client.get(f"{API}/marketing/recipients", params={"marca_id": latest_brand.id + 1000}, headers=admin_headers)
    assert other.json() == []


def test_recipients_require_the_marketing_permission(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    response = client.get(f"{API}/marketing/recipients", headers=auth_headers(client, seller.email))
    assert response.status_code == 403
