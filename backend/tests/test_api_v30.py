"""Estadísticas (solo ADMIN): productos más vendidos, valor del stock (activo neto / bruto),
marcas con más órdenes y motivos de ingreso."""
from __future__ import annotations

import pytest

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"


def _sell(client, headers, *lines) -> dict:
    body = {
        "branch_id": lines[0][0].branch_id,
        "items": [{"inventory_id": inv.id, "cantidad": cantidad} for inv, cantidad in lines],
        "metodo_pago": "TRANSFERENCIA",
    }
    response = client.post(f"{API}/sales", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def _order(client, headers, factory, brand, model, *motivos) -> dict:
    customer = factory.user(SystemRole.CLIENTE)
    body = {
        "cliente": {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "motivo_ingreso": list(motivos),
        "presupuesto": "50.00",
        "anticipo": "0.00",
    }
    response = client.post(f"{API}/work-orders", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_top_products_counts_units_of_confirmed_sales(client, admin_headers, factory):
    a = factory.inventory(precio="10.00", stock=50)
    b = factory.inventory(precio="5.00", stock=50)
    c = factory.inventory(precio="1.00", stock=50)
    factory.inventory(stock=50)  # never sold: not listed
    _sell(client, admin_headers, (a, 2), (b, 3))
    _sell(client, admin_headers, (a, 4))
    cancelled = _sell(client, admin_headers, (c, 20))
    assert client.post(f"{API}/sales/{cancelled['id']}/cancel", headers=admin_headers).status_code == 200

    response = client.get(f"{API}/dashboard/top-products", headers=admin_headers)
    assert response.status_code == 200, response.text
    rows = response.json()
    assert [(r["id"], r["cantidad"], r["monto"]) for r in rows] == [
        (a.product_id, 6, "60.00"),
        (b.product_id, 3, "15.00"),
    ]


def test_top_products_keeps_the_ten_most_sold(client, admin_headers, factory):
    inventories = [factory.inventory(stock=50) for _ in range(11)]
    for i, inv in enumerate(inventories):
        _sell(client, admin_headers, (inv, i + 1))
    rows = client.get(f"{API}/dashboard/top-products", headers=admin_headers).json()
    assert [r["cantidad"] for r in rows] == list(range(11, 1, -1))


def test_stock_value_sums_price_and_cost_by_total_stock(client, admin_headers, factory):
    other = factory.branch()
    product = factory.product(precio="10.00", stock=3)  # cost 5.00
    factory.stock_of(product, 2, other)  # total stock 5
    factory.product(precio="4.00", stock=10)  # cost 2.00
    factory.product(precio="99.00", stock=None)  # not in any branch

    response = client.get(f"{API}/dashboard/stock-value", headers=admin_headers)
    assert response.status_code == 200, response.text
    assert response.json() == {"activo_neto": "90.00", "activo_bruto": "45.00"}


def test_top_brands_and_entry_reasons(client, admin_headers, factory):
    samsung, galaxy = factory.brand_and_model()
    apple, iphone = factory.brand_and_model()
    _order(client, admin_headers, factory, samsung, galaxy, "PANTALLA", "BATERIA")
    _order(client, admin_headers, factory, samsung, galaxy, "PANTALLA")
    _order(client, admin_headers, factory, apple, iphone, "PIN_CARGA")

    brands = client.get(f"{API}/dashboard/top-brands", headers=admin_headers)
    assert brands.status_code == 200, brands.text
    assert [(b["id"], b["nombre"], b["ordenes"]) for b in brands.json()] == [
        (samsung.id, samsung.nombre, 2),
        (apple.id, apple.nombre, 1),
    ]

    reasons = client.get(f"{API}/dashboard/entry-reasons", headers=admin_headers)
    assert reasons.status_code == 200, reasons.text
    assert reasons.json() == [
        {"motivo": "PANTALLA", "etiqueta": "Pantalla", "ordenes": 2},
        {"motivo": "PIN_CARGA", "etiqueta": "PIN de carga", "ordenes": 1},
        {"motivo": "BATERIA", "etiqueta": "Batería", "ordenes": 1},
    ]


@pytest.mark.parametrize("path", ["top-products", "stock-value", "top-brands", "entry-reasons"])
def test_statistics_are_only_for_the_admin_role(client, factory, path):
    seller = factory.user(SystemRole.VENDEDOR)
    assert client.get(f"{API}/dashboard/{path}", headers=auth_headers(client, seller.email)).status_code == 403
    assert client.get(f"{API}/dashboard/{path}").status_code == 401
