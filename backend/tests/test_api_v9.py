"""Configuración: the administrator empties the business data (orders, sales, inventory,
catalogs and clients); users, roles, permissions and branches are kept."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"
URL = f"{API}/settings/reset-data"


def _order(client, headers, factory):
    customer = factory.user(SystemRole.CLIENTE)
    brand, model = factory.brand_and_model()
    body = {
        "cliente": {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "motivo_ingreso": "BATERIA",
        "presupuesto": "50.00",
        "anticipo": "0.00",
    }
    response = client.post(f"{API}/work-orders", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_reset_empties_the_business_data_and_keeps_the_users(client, admin_headers, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    _order(client, admin_headers, factory)
    factory.product(stock=5)
    factory.spare_part()

    response = client.post(URL, json={"confirmacion": "vaciar"}, headers=admin_headers)
    assert response.status_code == 200, response.text
    eliminados = response.json()["eliminados"]
    assert eliminados["ordenes"] == 1 and eliminados["clientes"] == 1
    assert eliminados["productos"] == 1 and eliminados["inventario"] == 1 and eliminados["repuestos"] == 1
    assert eliminados["marcas"] == 1 and eliminados["modelos"] == 1 and eliminados["categorias"] == 1

    for path in ("work-orders", "products", "categories", "brands", "models", "spare-parts", "sales", "clients"):
        listed = client.get(f"{API}/{path}", headers=admin_headers)
        assert listed.status_code == 200, path
        assert listed.json()["total"] == 0, path
    # Staff users and branches are kept: the seller can still log in.
    auth_headers(client, seller.email)
    assert client.get(f"{API}/branches", headers=admin_headers).json()["total"] == 1

    # Numbering starts again: the next order is N.º 1.
    assert _order(client, admin_headers, factory)["num_orden"] == 1


def test_reset_requires_the_confirmation_text(client, admin_headers, factory):
    factory.product()
    response = client.post(URL, json={"confirmacion": "si"}, headers=admin_headers)
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "RESET_NOT_CONFIRMED"
    assert client.get(f"{API}/products", headers=admin_headers).json()["total"] == 1


def test_only_the_administrator_can_reset(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    response = client.post(URL, json={"confirmacion": "VACIAR"}, headers=auth_headers(client, seller.email))
    assert response.status_code == 403


def test_default_administrator_is_seeded(client):
    headers = auth_headers(client, "josedavidip89@gmail.com", "sinclav3")
    me = client.get(f"{API}/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["role"]["nombre"] == "ADMIN"
