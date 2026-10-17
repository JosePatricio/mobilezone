"""Órdenes: the cost of the spare part is entered when the order is finalized; the sale keeps it
and shows the profit (total - costo de repuesto)."""
from __future__ import annotations

from tests.test_api_v12 import _order_body
from tests.test_api_v21 import _finalize_body, _supplier

API = "/api/v1"


def test_finalize_with_spare_part_cost_registers_the_profit_in_the_sale(client, admin_headers, uow, factory):
    supplier = _supplier(uow, "Repuestos Costo")
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    done = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json=_finalize_body(factory, supplier_id=supplier.id, costo_repuesto="12.50"),
        headers=admin_headers,
    )
    assert done.status_code == 200, done.text
    ref = done.json()["sale"]
    assert ref["costo_repuesto"] == "12.50"
    sale = client.get(f"{API}/sales/{ref['id']}", headers=admin_headers).json()
    total = float(sale["total"])
    assert (sale["costo_repuesto"], float(sale["ganancia"])) == ("12.50", round(total - 12.5, 2))
    # The header "Has vendido" of the seller also shows the amount minus the spare part costs.
    summary = client.get(f"{API}/sales/summary/today", headers=admin_headers).json()
    assert summary["costo_repuesto"] == "12.50"
    assert float(summary["neto"]) == round(float(summary["total"]) - 12.5, 2)


def test_finalize_without_spare_part_cost_has_no_profit(client, admin_headers, uow, factory):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    done = client.post(f"{API}/work-orders/{order['id']}/finalize", json=_finalize_body(factory), headers=admin_headers)
    assert done.status_code == 200, done.text
    sale = client.get(f"{API}/sales/{done.json()['sale']['id']}", headers=admin_headers).json()
    assert (sale["costo_repuesto"], sale["ganancia"]) == (None, None)


def test_finalize_rejects_a_negative_spare_part_cost(client, admin_headers, uow, factory):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    url = f"{API}/work-orders/{order['id']}/finalize"
    response = client.post(url, json=_finalize_body(factory, costo_repuesto="-1"), headers=admin_headers)
    assert response.status_code == 422
    assert client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()["estado"] == 0
