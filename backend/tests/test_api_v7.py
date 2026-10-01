"""Work orders v7: client email and technical model of the phone."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import valid_cedula

API = "/api/v1"


def _payload(factory, cliente, **overrides):
    brand, model = factory.brand_and_model()
    payload = {
        "cliente": cliente,
        "marca_id": brand.id,
        "modelo_id": model.id,
        "modelo_tecnico": " SM-A105M ",
        "motivo_ingreso": "BATERIA",
        "presupuesto": "40.00",
        "anticipo": "10.00",
    }
    payload.update(overrides)
    return payload


def _client(customer, **extra):
    return {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido, **extra}


def test_technical_model_is_saved(client, admin_headers, factory):
    customer = factory.user(SystemRole.CLIENTE)
    order = client.post(f"{API}/work-orders", json=_payload(factory, _client(customer)), headers=admin_headers)
    assert order.status_code == 201, order.text
    assert order.json()["modelo_tecnico"] == "SM-A105M"
    updated = client.put(
        f"{API}/work-orders/{order.json()['id']}",
        json=_payload(factory, _client(customer), modelo_tecnico=""),
        headers=admin_headers,
    )
    assert updated.json()["modelo_tecnico"] is None


def test_email_completes_a_client_without_email(client, admin_headers, factory, uow):
    response = client.post(
        f"{API}/clients",
        json={"nombre": "Sin", "apellido": "Email", "identificacion": valid_cedula(7001)},
        headers=admin_headers,
    )
    customer = response.json()
    cliente = {"identificacion": customer["identificacion"], "nombre": "Sin", "apellido": "Email", "email": "Sin.Email@Example.com"}
    order = client.post(f"{API}/work-orders", json=_payload(factory, cliente), headers=admin_headers)
    assert order.status_code == 201, order.text
    assert order.json()["cliente"]["email"] == "sin.email@example.com"
    lookup = client.get(
        f"{API}/work-orders/customers/lookup", params={"identificacion": customer["identificacion"]}, headers=admin_headers
    )
    assert lookup.json()["email"] == "sin.email@example.com"


def test_existing_email_is_kept(client, admin_headers, factory):
    customer = factory.user(SystemRole.CLIENTE)  # has an email
    order = client.post(
        f"{API}/work-orders", json=_payload(factory, _client(customer, email="otro@example.com")), headers=admin_headers
    ).json()
    assert order["cliente"]["email"] == customer.email


def test_email_of_another_user_is_rejected(client, admin_headers, factory):
    other = factory.user(SystemRole.VENDEDOR)
    response = client.post(
        f"{API}/clients",
        json={"nombre": "Sin", "apellido": "Email", "identificacion": valid_cedula(7002)},
        headers=admin_headers,
    ).json()
    cliente = {"identificacion": response["identificacion"], "nombre": "Sin", "apellido": "Email", "email": other.email}
    rejected = client.post(f"{API}/work-orders", json=_payload(factory, cliente), headers=admin_headers)
    assert rejected.status_code == 409
    assert rejected.json()["error"]["details"]["field"] == "cliente.email"


def test_invalid_email_format(client, admin_headers, factory):
    customer = factory.user(SystemRole.CLIENTE)
    response = client.post(
        f"{API}/work-orders", json=_payload(factory, _client(customer, email="no-es-email")), headers=admin_headers
    )
    assert response.status_code == 422
