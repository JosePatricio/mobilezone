"""Órdenes: delete an order completely (button Eliminar in the order detail)."""
from __future__ import annotations

from pathlib import Path

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v5 import _png
from tests.test_api_v12 import _order_body

API = "/api/v1"


def test_delete_order_with_photos_spare_parts_and_history(client, admin_headers, factory, settings):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    url = f"{API}/work-orders/{order['id']}"
    photo = client.post(f"{url}/photos", files=_png(), headers=admin_headers).json()
    part = factory.spare_part()
    added = client.post(f"{url}/spare-parts", json={"spare_part_id": part.id, "cantidad": 1}, headers=admin_headers)
    assert added.status_code == 201, added.text
    client.patch(f"{url}/status", json={"estado": 1, "fecha_entrega": "2026-12-01T10:00:00"}, headers=admin_headers)
    stored = Path(settings.media_dir) / photo["url"].removeprefix("/media/")
    assert stored.exists()

    response = client.delete(url, headers=admin_headers)
    assert response.status_code == 204, response.text
    assert client.get(url, headers=admin_headers).status_code == 404
    assert client.get(f"{API}/work-orders", headers=admin_headers).json()["total"] == 0
    assert not stored.exists()
    # The spare part of the catalog is kept.
    assert client.get(f"{API}/spare-parts/{part.id}", headers=admin_headers).status_code == 200


def test_delete_finalized_order_also_deletes_its_sale(client, admin_headers, factory):
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    url = f"{API}/work-orders/{order['id']}"
    finalized = client.post(
        f"{url}/finalize", json={"branch_id": factory.default_branch.id, "metodo_pago": "TRANSFERENCIA"}, headers=admin_headers
    )
    assert finalized.status_code == 200, finalized.text
    sale_id = finalized.json()["sale"]["id"]

    assert client.delete(url, headers=admin_headers).status_code == 204
    assert client.get(f"{API}/sales/{sale_id}", headers=admin_headers).status_code == 404


def test_only_users_with_permission_delete_orders(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=headers).json()
    assert client.delete(f"{API}/work-orders/{order['id']}", headers=headers).status_code == 403


def test_delete_unknown_order(client, admin_headers):
    response = client.delete(f"{API}/work-orders/999", headers=admin_headers)
    assert response.status_code == 404
