"""Órdenes: the supplier (proveedor) of the repair is chosen when the order is finalized."""
from __future__ import annotations

from app.domain.entities import Supplier
from tests.test_api_v12 import _order_body

API = "/api/v1"


def _supplier(uow, nombre: str, estado: bool = True) -> Supplier:
    with uow.transaction():
        supplier = Supplier(nombre=nombre, estado=estado)
        uow.suppliers.add(supplier)
    return supplier


def _finalize_body(factory, **extra):
    return {"branch_id": factory.default_branch.id, "metodo_pago": "TRANSFERENCIA", **extra}


def test_order_suppliers_lists_only_active_ones(client, admin_headers, uow, factory):
    _supplier(uow, "Zeta Repuestos")
    _supplier(uow, "Alfa Partes")
    _supplier(uow, "Inactivo", estado=False)
    response = client.get(f"{API}/work-orders/suppliers", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert [s["nombre"] for s in response.json()] == ["Alfa Partes", "Zeta Repuestos"]

    # Read fresh on every call: a supplier added later shows up without reloading anything.
    _supplier(uow, "Nuevo")
    assert "Nuevo" in [s["nombre"] for s in client.get(f"{API}/work-orders/suppliers", headers=admin_headers).json()]


def test_finalize_saves_the_supplier(client, admin_headers, uow, factory):
    supplier = _supplier(uow, "Proveedor Orden")
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    assert order["supplier"] is None
    response = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json=_finalize_body(factory, supplier_id=supplier.id),
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    data = response.json()
    assert (data["estado"], data["supplier_id"], data["supplier"]["nombre"]) == (2, supplier.id, "Proveedor Orden")


def test_finalize_rejects_unknown_or_inactive_supplier(client, admin_headers, uow, factory):
    inactive = _supplier(uow, "Inactivo", estado=False)
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    url = f"{API}/work-orders/{order['id']}/finalize"
    missing = client.post(url, json=_finalize_body(factory, supplier_id=999999), headers=admin_headers)
    assert missing.status_code == 404 and missing.json()["error"]["code"] == "SUPPLIER_NOT_FOUND"
    wrong = client.post(url, json=_finalize_body(factory, supplier_id=inactive.id), headers=admin_headers)
    assert wrong.status_code == 400 and wrong.json()["error"]["code"] == "SUPPLIER_INACTIVE"
    # Nothing was finalized.
    assert client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()["estado"] == 0


def test_order_form_saves_an_optional_supplier(client, admin_headers, uow, factory):
    supplier = _supplier(uow, "Proveedor Formulario")
    body = _order_body(factory, supplier_id=supplier.id)
    created = client.post(f"{API}/work-orders", json=body, headers=admin_headers)
    assert created.status_code == 201, created.text
    order = created.json()
    assert order["supplier"] == {"id": supplier.id, "nombre": "Proveedor Formulario"}
    listed = client.get(f"{API}/work-orders", params={"num_orden": order["num_orden"]}, headers=admin_headers).json()
    assert listed["items"][0]["supplier_id"] == supplier.id

    # An inactive supplier is kept on the order that already has it, but cannot be newly chosen.
    with uow.transaction():
        uow.suppliers.get(supplier.id).estado = False
    kept = client.put(f"{API}/work-orders/{order['id']}", json=body, headers=admin_headers)
    assert kept.status_code == 200, kept.text
    other = client.post(f"{API}/work-orders", json=body, headers=admin_headers)
    assert other.status_code == 400 and other.json()["error"]["code"] == "SUPPLIER_INACTIVE"

    # Optional: it can be removed.
    cleared = client.put(f"{API}/work-orders/{order['id']}", json={**body, "supplier_id": None}, headers=admin_headers)
    assert cleared.json()["supplier"] is None


def test_finalize_without_supplier_keeps_the_one_from_the_form(client, admin_headers, uow, factory):
    supplier = _supplier(uow, "Proveedor Previo")
    order = client.post(
        f"{API}/work-orders", json=_order_body(factory, supplier_id=supplier.id), headers=admin_headers
    ).json()
    done = client.post(f"{API}/work-orders/{order['id']}/finalize", json=_finalize_body(factory), headers=admin_headers)
    assert done.status_code == 200, done.text
    assert done.json()["supplier_id"] == supplier.id
