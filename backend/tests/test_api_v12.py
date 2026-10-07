"""Sucursal: address (direccion); each work order belongs to a branch whose address and phone
are printed on the receipt."""
from __future__ import annotations

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


def test_branch_address_is_saved(client, admin_headers):
    body = {"nombre": "Norte", "ubicacion": "CC El Bosque", "telefono": "022345678", "direccion": "Av. 6 de Diciembre N34-120"}
    created = client.post(f"{API}/branches", json=body, headers=admin_headers)
    assert created.status_code == 201, created.text
    assert created.json()["direccion"] == "Av. 6 de Diciembre N34-120"

    updated = client.put(f"{API}/branches/{created.json()['id']}", json={**body, "direccion": "  "}, headers=admin_headers)
    assert updated.status_code == 200 and updated.json()["direccion"] is None


def test_order_takes_the_branch_of_the_seller(client, factory):
    norte = factory.branch("Norte")
    seller = factory.user(SystemRole.VENDEDOR, branches=[norte])
    headers = auth_headers(client, seller.email)

    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=headers)
    assert order.status_code == 201, order.text
    assert order.json()["branch_id"] == norte.id
    branch = order.json()["branch"]
    assert branch["nombre"] == "Norte" and set(branch) >= {"direccion", "telefono", "ubicacion"}


def test_order_without_assigned_branch_uses_the_first_branch(client, admin_headers, factory):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    assert order["branch"]["nombre"] == "Matriz"


def test_order_branch_can_be_chosen_and_changed(client, admin_headers, factory):
    norte = factory.branch("Norte")
    sur = factory.branch("Sur")
    order = client.post(f"{API}/work-orders", json=_order_body(factory, branch_id=norte.id), headers=admin_headers).json()
    assert order["branch_id"] == norte.id

    body = _order_body(factory, branch_id=sur.id)
    updated = client.put(f"{API}/work-orders/{order['id']}", json=body, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["branch"]["nombre"] == "Sur"

    # Without branch_id the update keeps the current branch.
    kept = client.put(f"{API}/work-orders/{order['id']}", json=_order_body(factory), headers=admin_headers)
    assert kept.json()["branch_id"] == sur.id


def test_inactive_branch_is_rejected(client, admin_headers, factory):
    closed = factory.branch("Cerrada", estado=False)
    response = client.post(f"{API}/work-orders", json=_order_body(factory, branch_id=closed.id), headers=admin_headers)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "INVALID_BRANCH"


def test_seller_lists_the_branches_for_the_order_form(client, factory):
    factory.branch("Cerrada", estado=False)
    tech = factory.user(SystemRole.VENDEDOR)
    response = client.get(f"{API}/work-orders/branches", headers=auth_headers(client, tech.email))
    assert response.status_code == 200
    assert [b["nombre"] for b in response.json()] == ["Matriz"]
