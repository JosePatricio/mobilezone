"""Ventas: each line can be sold at the wholesale price (precio al por mayor) instead of the PVP."""
from __future__ import annotations

from decimal import Decimal

from app.domain.entities import Sale

API = "/api/v1"


def test_line_price_can_switch_to_wholesale():
    sale = Sale(user_id=1)
    line = sale.add_line(product_id=1, cantidad=2, precio_unitario=Decimal("10.00"))
    assert line.por_mayor is False
    line.change_price(Decimal("8.00"), True)
    sale.recalculate_total()
    assert (line.por_mayor, line.subtotal, sale.total) == (True, Decimal("16.00"), Decimal("16.00"))


def _body(inv, cantidad=1, por_mayor=False, **extra):
    return {
        "branch_id": inv.branch_id,
        "items": [{"inventory_id": inv.id, "cantidad": cantidad, "por_mayor": por_mayor}],
        "metodo_pago": "TRANSFERENCIA",
        **extra,
    }


def test_sale_at_wholesale_price(client, admin_headers, factory):
    pvp = factory.inventory(precio="10.00", stock=5, precio_mayor=Decimal("7.50"))
    mayor = factory.inventory(precio="20.00", stock=5, precio_mayor=Decimal("15.00"))
    body = {
        "branch_id": pvp.branch_id,
        "items": [
            {"inventory_id": pvp.id, "cantidad": 1},  # por_mayor defaults to false (PVP)
            {"inventory_id": mayor.id, "cantidad": 2, "por_mayor": True},
        ],
        "metodo_pago": "TRANSFERENCIA",
    }
    response = client.post(f"{API}/sales", json=body, headers=admin_headers)
    assert response.status_code == 201, response.text
    sale = response.json()
    lines = {d["inventory_id"]: d for d in sale["details"]}
    assert (lines[pvp.id]["precio_unitario"], lines[pvp.id]["por_mayor"]) == ("10.00", False)
    assert (lines[mayor.id]["precio_unitario"], lines[mayor.id]["por_mayor"]) == ("15.00", True)
    assert sale["total"] == "40.00"

    inventory = client.get(f"{API}/inventory/{mayor.id}", headers=admin_headers).json()
    assert inventory["product"]["precio_mayor"] == "15.00"


def test_editing_a_sale_switches_the_line_price(client, admin_headers, factory):
    inv = factory.inventory(precio="10.00", stock=5, precio_mayor=Decimal("6.00"))
    sale = client.post(f"{API}/sales", json=_body(inv, cantidad=2), headers=admin_headers).json()
    url = f"{API}/sales/{sale['id']}"

    edited = client.put(url, json={k: v for k, v in _body(inv, 2, True).items() if k != "branch_id"}, headers=admin_headers)
    assert edited.status_code == 200, edited.text
    line = edited.json()["details"][0]
    assert (line["precio_unitario"], line["por_mayor"], edited.json()["total"]) == ("6.00", True, "12.00")

    back = client.put(url, json={k: v for k, v in _body(inv, 3).items() if k != "branch_id"}, headers=admin_headers)
    line = back.json()["details"][0]
    assert (line["precio_unitario"], line["por_mayor"], back.json()["total"]) == ("10.00", False, "30.00")


def test_inventory_search_matches_every_word_in_any_order(client, admin_headers, factory):
    """Ventas searches the branch inventory: "CABLE LIGHTNING A C" finds "Cable Lightning a Tipo C"."""
    inv = factory.inventory(nombre="Cable Lightning a Tipo C", stock=3)
    factory.inventory(nombre="Cable USB tipo C", stock=3)
    url = f"{API}/inventory"
    for term in ("CABLE LIGHTNING A C", "  lightning   cable ", "c tipo lightning"):
        found = client.get(url, params={"branch_id": inv.branch_id, "search": term, "active": True}, headers=admin_headers)
        assert [i["id"] for i in found.json()["items"]] == [inv.id], term
    none = client.get(url, params={"search": "cable lightning micro"}, headers=admin_headers).json()
    assert none["items"] == []
