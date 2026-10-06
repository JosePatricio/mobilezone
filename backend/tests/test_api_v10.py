"""Repuestos de afiliados: technicians publish their spare parts; the catalog is public and
counts its visits. The address shown is the one of the affiliate user."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers

API = "/api/v1"
URL = f"{API}/affiliate-parts"
PUBLIC = f"{API}/public/affiliate-parts"

PART = {"tipo": "DISPLAY", "condicion": "USADO", "garantia": True, "descripcion": "Samsung A10", "precio": "35.00"}


def _affiliate(client, admin_headers, email="afiliado@example.com", direccion="Av. Amazonas N24-12"):
    """The administrator creates the affiliate (TECNICO role) with their address."""
    roles = client.get(f"{API}/roles", params={"search": "TECNICO"}, headers=admin_headers).json()["items"]
    body = {
        "nombre": "Ana",
        "apellido": "Afiliada",
        "email": email,
        "password": "Secret1234",
        "rol_id": roles[0]["id"],
        "celular": "0991234567",
        "provincia": "Pichincha",
        "ciudad": "Quito",
        "direccion": direccion,
    }
    response = client.post(f"{API}/users", json=body, headers=admin_headers)
    assert response.status_code == 201, response.text
    assert response.json()["direccion"] == direccion
    return response.json(), auth_headers(client, email)


def test_affiliate_publishes_and_sees_only_their_own_parts(client, admin_headers):
    ana, ana_headers = _affiliate(client, admin_headers)
    _, other_headers = _affiliate(client, admin_headers, "otro@example.com", "Calle 10")

    created = client.post(URL, json=PART, headers=ana_headers)
    assert created.status_code == 201, created.text
    part = created.json()
    assert part["tipo_label"] == "Display" and part["condicion_label"] == "Usado"
    assert part["estado"] == "DISPONIBLE" and part["estado_label"] == "Disponible"
    assert part["garantia"] is True and part["precio"] == "35.00"
    assert part["afiliado"]["id"] == ana["id"]
    assert part["afiliado"]["direccion"] == "Av. Amazonas N24-12"
    client.post(URL, json={"tipo": "BATERIA"}, headers=other_headers)

    mine = client.get(URL, headers=ana_headers).json()
    assert mine["total"] == 1 and mine["items"][0]["id"] == part["id"]
    # Another affiliate cannot see, edit or delete it.
    assert client.get(f"{URL}/{part['id']}", headers=other_headers).status_code == 404
    assert client.put(f"{URL}/{part['id']}", json=PART, headers=other_headers).status_code == 404
    assert client.delete(f"{URL}/{part['id']}", headers=other_headers).status_code == 404
    # The other user's filter is ignored without affiliate_parts.any.
    assert client.get(URL, params={"user_id": ana["id"]}, headers=other_headers).json()["total"] == 1
    # The administrator manages the parts of every affiliate.
    assert client.get(URL, headers=admin_headers).json()["total"] == 2
    assert client.get(URL, params={"user_id": ana["id"]}, headers=admin_headers).json()["total"] == 1


def test_affiliate_edits_marks_sold_and_deletes(client, admin_headers):
    _, headers = _affiliate(client, admin_headers)
    part = client.post(URL, json=PART, headers=headers).json()

    updated = client.put(f"{URL}/{part['id']}", json={**PART, "condicion": "NUEVO", "precio": None}, headers=headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["condicion"] == "NUEVO" and updated.json()["precio"] is None

    sold = client.patch(f"{URL}/{part['id']}/status", json={"estado": "VENDIDO"}, headers=headers)
    assert sold.status_code == 200 and sold.json()["estado_label"] == "Vendido"
    assert client.get(URL, params={"estado": "DISPONIBLE"}, headers=headers).json()["total"] == 0

    assert client.delete(f"{URL}/{part['id']}", headers=headers).status_code == 204
    assert client.get(URL, headers=headers).json()["total"] == 0


def test_invalid_part_type_is_rejected(client, admin_headers):
    _, headers = _affiliate(client, admin_headers)
    response = client.post(URL, json={**PART, "tipo": "PARLANTE"}, headers=headers)
    assert response.status_code == 422


def test_public_catalog_shows_every_affiliate_without_login(client, admin_headers):
    ana, ana_headers = _affiliate(client, admin_headers)
    _, other_headers = _affiliate(client, admin_headers, "otro@example.com", "Calle 10")
    client.post(URL, json=PART, headers=ana_headers)
    client.post(URL, json={"tipo": "BATERIA", "condicion": "NUEVO"}, headers=other_headers)

    catalog = client.get(PUBLIC)
    assert catalog.status_code == 200
    assert catalog.json()["total"] == 2
    assert {p["afiliado"]["direccion"] for p in catalog.json()["items"]} == {"Av. Amazonas N24-12", "Calle 10"}
    assert client.get(PUBLIC, params={"tipo": "BATERIA"}).json()["total"] == 1
    assert client.get(PUBLIC, params={"condicion": "USADO", "garantia": True}).json()["total"] == 1
    assert client.get(PUBLIC, params={"search": "samsung"}).json()["total"] == 1

    # Parts of a deactivated affiliate are no longer public.
    client.patch(f"{API}/users/{ana['id']}/status", json={"estado": False}, headers=admin_headers)
    assert client.get(PUBLIC).json()["total"] == 1

    catalogs = client.get(f"{PUBLIC}/catalogs").json()
    assert [t["label"] for t in catalogs["tipos"]] == [
        "Cámaras", "Placa principal", "Batería", "Placa de carga", "Antenas",
        "Cristal de cámara", "Tapas", "Display", "BackCover",
    ]
    assert [c["value"] for c in catalogs["condiciones"]] == ["NUEVO", "USADO"]
    assert [e["value"] for e in catalogs["estados"]] == ["DISPONIBLE", "VENDIDO"]


def test_public_visits_are_counted(client, admin_headers):
    _, headers = _affiliate(client, admin_headers)
    assert client.get(f"{URL}/visits", headers=headers).json() == {"visitas": 0}
    assert client.post(f"{PUBLIC}/visits").json() == {"visitas": 1}
    assert client.post(f"{PUBLIC}/visits").json() == {"visitas": 2}
    assert client.get(f"{URL}/visits", headers=headers).json() == {"visitas": 2}


def test_only_affiliates_manage_parts(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    assert client.get(URL, headers=headers).status_code == 403
    assert client.post(URL, json=PART, headers=headers).status_code == 403
    assert client.get(URL).status_code == 401
