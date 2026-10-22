"""Propaganda → Ruleta (MySQL): create a wheel with images, send its links and play them once."""
from __future__ import annotations

import json
from datetime import date, timedelta

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"x" * 10


def _create(client, headers, **overrides):
    today = date.today()
    data = {
        "nombre": "Ruleta de octubre",
        "fecha_inicio": str(today - timedelta(days=1)),
        "fecha_fin": str(today + timedelta(days=7)),
        "items": [
            {"nombre": "Mica gratis", "imagen": 0},
            {"nombre": "10% de descuento"},
            {"nombre": "Sigue intentando", "premio": False},
        ],
        **overrides,
    }
    return client.post(
        f"{API}/marketing/roulettes",
        headers=headers,
        data={"data": json.dumps(data)},
        files=[("images", ("mica.png", PNG, "image/png"))],
    )


def test_create_list_and_delete_roulette(client, admin_headers):
    response = _create(client, admin_headers)
    assert response.status_code == 201, response.text
    roulette = response.json()
    assert (roulette["items"], roulette["enlaces"], roulette["creado_por"]) == (3, 0, "Administrador Sistema")

    detail = client.get(f"{API}/marketing/roulettes/{roulette['id']}", headers=admin_headers).json()
    assert [(i["nombre"], i["premio"]) for i in detail["items"]] == [
        ("Mica gratis", True), ("10% de descuento", True), ("Sigue intentando", False),
    ]
    assert detail["items"][0]["imagen_url"].startswith("/media/roulettes/")
    assert detail["items"][1]["imagen_url"] is None and detail["links"] == []

    assert [r["id"] for r in client.get(f"{API}/marketing/roulettes", headers=admin_headers).json()] == [roulette["id"]]
    assert client.delete(f"{API}/marketing/roulettes/{roulette['id']}", headers=admin_headers).status_code == 204
    assert client.get(f"{API}/marketing/roulettes", headers=admin_headers).json() == []


def test_create_roulette_needs_a_valid_image_and_dates(client, admin_headers):
    response = _create(client, admin_headers, fecha_fin="2020-01-01")
    assert response.status_code == 422
    missing = _create(client, admin_headers, items=[{"nombre": "A", "imagen": 3}, {"nombre": "B"}])
    assert missing.status_code == 422


def test_roulette_requires_marketing_permission(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    assert client.get(f"{API}/marketing/roulettes", headers=auth_headers(client, seller.email)).status_code == 403


def test_link_is_opened_played_once_and_recorded(client, admin_headers, uow, factory):
    roulette = _create(client, admin_headers).json()
    cliente = factory.user(SystemRole.CLIENTE)
    with uow.transaction():
        uow.roulettes.add_links(roulette["id"], None, [("token-1", cliente.id, "593991234567")])

    opened = client.get(f"{API}/public/roulette/token-1")
    assert opened.status_code == 200, opened.text
    assert (opened.json()["estado"], len(opened.json()["items"])) == ("DISPONIBLE", 3)

    played = client.post(f"{API}/public/roulette/token-1/play")
    assert played.status_code == 200, played.text
    result = played.json()
    assert result["estado"] == "JUGADO" and result["resultado"] in (0, 1, 2)
    assert client.post(f"{API}/public/roulette/token-1/play").json()["error"]["code"] == "ROULETTE_ALREADY_PLAYED"
    assert client.get(f"{API}/public/roulette/nope").status_code == 404

    detail = client.get(f"{API}/marketing/roulettes/{roulette['id']}", headers=admin_headers).json()
    link = detail["links"][0]
    won = result["items"][result["resultado"]]
    assert link["cliente"] == f"{cliente.nombre} {cliente.apellido}"
    assert link["abierto_at"] and link["jugado_at"]
    assert (link["resultado"], link["gano"]) == (won["nombre"], won["premio"])
    summary = detail["roulette"]
    assert (summary["enlaces"], summary["abiertos"], summary["jugados"], summary["ganadores"]) == (
        1, 1, 1, int(won["premio"])
    )
    # A wheel already sent cannot be deleted.
    assert client.delete(f"{API}/marketing/roulettes/{roulette['id']}", headers=admin_headers).status_code == 409
