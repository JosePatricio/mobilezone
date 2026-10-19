"""Productos: mínimo recomendado de stock; the dashboard alerts the products below it."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"


def _body(category_id: int, **kw) -> dict:
    return {
        "category_id": category_id,
        "sku": "MIN-1",
        "nombre": "Funda",
        "precio_venta": "5.00",
        "precio_costo": "2.00",
        "precio_mayor": "4.00",
        **kw,
    }


def test_product_minimum_is_saved_and_defaults_to_zero(client, admin_headers, factory):
    category = factory.category()
    created = client.post(f"{API}/products", json=_body(category.id), headers=admin_headers)
    assert created.status_code == 201, created.text
    assert created.json()["minimo_recomendado"] == 0  # no alert

    pid = created.json()["id"]
    updated = client.put(f"{API}/products/{pid}", json=_body(category.id, minimo_recomendado=5), headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert client.get(f"{API}/products/{pid}", headers=admin_headers).json()["minimo_recomendado"] == 5

    for invalid in (-1, 1.5, "x"):
        response = client.put(
            f"{API}/products/{pid}", json=_body(category.id, minimo_recomendado=invalid), headers=admin_headers
        )
        assert response.status_code == 422, invalid


def test_low_stock_lists_active_products_below_their_minimum(client, admin_headers, factory):
    other_branch = factory.branch()
    short = factory.product(stock=1, minimo_recomendado=5, nombre="Cable corto")  # missing 4
    very_short = factory.product(stock=None, minimo_recomendado=10, nombre="Vidrio")  # never stocked: missing 10
    split = factory.product(stock=2, minimo_recomendado=5, nombre="Split")
    factory.stock_of(split, 3, other_branch)  # 2 + 3 = 5 in every branch: not below
    factory.product(stock=0, nombre="Sin minimo")  # minimum 0: never alerted
    factory.product(stock=0, minimo_recomendado=3, estado=False)  # inactive: not alerted

    response = client.get(f"{API}/dashboard/low-stock", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert [(p["id"], p["stock"], p["minimo_recomendado"], p["faltante"]) for p in response.json()] == [
        (very_short.id, 0, 10, 10),
        (short.id, 1, 5, 4),
    ]
    assert response.json()[0]["sku"] == very_short.sku and response.json()[0]["nombre"] == "Vidrio"


def test_low_stock_requires_products_view(client, factory):
    tech = factory.user(SystemRole.TECNICO)  # affiliate parts only
    assert client.get(f"{API}/dashboard/low-stock", headers=auth_headers(client, tech.email)).status_code == 403
    seller = factory.user(SystemRole.VENDEDOR)
    assert client.get(f"{API}/dashboard/low-stock", headers=auth_headers(client, seller.email)).status_code == 200
