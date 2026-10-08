"""Branches (sucursales), inventory per branch, user branches, cédula/RUC validation,
provinces / cities and customer registration from the sales screen."""
from __future__ import annotations

import pytest

from app.domain.value_objects.enums import SystemRole
from app.domain.value_objects.identificacion import IDENTIFICACION_VALIDATION_ENABLED
from tests.conftest import auth_headers, valid_cedula

API = "/api/v1"


def _role_id(uow, name: str) -> int:
    return uow.roles.get_by_nombre(name).id


class TestBranches:
    def test_crud(self, client, admin_headers):
        created = client.post(
            f"{API}/branches",
            json={"nombre": "Norte", "ubicacion": "Av. 6 de Diciembre y Naciones Unidas", "telefono": "022345678"},
            headers=admin_headers,
        )
        assert created.status_code == 201, created.text
        bid = created.json()["id"]
        dup = client.post(f"{API}/branches", json={"nombre": "norte", "ubicacion": "X"}, headers=admin_headers)
        assert dup.json()["error"]["code"] == "BRANCH_ALREADY_EXISTS"
        updated = client.put(
            f"{API}/branches/{bid}", json={"nombre": "Norte", "ubicacion": "CC El Jardín"}, headers=admin_headers
        )
        assert updated.json()["ubicacion"] == "CC El Jardín"
        listed = client.get(f"{API}/branches", headers=admin_headers).json()
        assert {b["nombre"] for b in listed["items"]} == {"Matriz", "Norte"}

    def test_seller_cannot_manage_branches_but_lists_them_for_inventory(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        assert client.get(f"{API}/branches", headers=headers).status_code == 403
        options = client.get(f"{API}/inventory/branches", headers=headers).json()
        assert [b["nombre"] for b in options] == ["Matriz"]


class TestInventory:
    def test_search_by_branch_sku_and_name(self, client, factory):
        norte = factory.branch("Norte")
        seller = factory.user(SystemRole.VENDEDOR)  # Matriz
        headers = auth_headers(client, seller.email)
        pantalla = factory.product(stock=3)  # Matriz
        factory.stock_of(pantalla, 7, norte)
        solo_norte = factory.product(stock=None)
        factory.stock_of(solo_norte, 2, norte)

        matriz = client.get(
            f"{API}/inventory", params={"branch_id": factory.default_branch.id}, headers=headers
        ).json()
        assert [i["product"]["sku"] for i in matriz["items"]] == [pantalla.sku]
        assert matriz["items"][0]["stock"] == 3
        assert matriz["items"][0]["product"]["precio_venta"] == "10.00"

        # The product is not in the seller's branch: the Inventario module shows where it is.
        found = client.get(f"{API}/inventory", params={"search": solo_norte.sku.lower()}, headers=headers).json()
        assert [(i["branch"]["nombre"], i["stock"]) for i in found["items"]] == [("Norte", 2)]
        by_name = client.get(f"{API}/inventory", params={"search": pantalla.nombre}, headers=headers).json()
        assert {i["branch"]["nombre"] for i in by_name["items"]} == {"Matriz", "Norte"}

        product = client.get(f"{API}/products/{pantalla.id}", headers=headers).json()
        assert product["stock"] == 10  # total of every branch

    def test_seller_changes_stock_only_in_own_branches(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)  # Matriz
        inv = factory.inventory(stock=3)
        response = client.patch(f"{API}/inventory/{inv.id}/stock", json={"cantidad": 5}, headers=headers)
        assert response.status_code == 200 and response.json()["stock"] == 8
        other = factory.inventory(stock=3, branch=factory.branch("Norte"))
        response = client.patch(f"{API}/inventory/{other.id}/stock", json={"cantidad": 5}, headers=headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "BRANCH_NOT_ASSIGNED"

    def test_delete_only_without_stock(self, client, admin_headers, factory):
        inv = factory.inventory(stock=2)
        blocked = client.delete(f"{API}/inventory/{inv.id}", headers=admin_headers)
        assert blocked.json()["error"]["code"] == "INVENTORY_HAS_STOCK"
        empty = factory.inventory(stock=0)
        assert client.delete(f"{API}/inventory/{empty.id}", headers=admin_headers).status_code == 204


class TestSalesByBranch:
    def test_seller_only_sells_from_assigned_branch(self, client, factory):
        norte = factory.branch("Norte")
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)  # Matriz
        inv = factory.inventory(stock=5, branch=norte)
        response = client.post(
            f"{API}/sales",
            json={"metodo_pago": "EFECTIVO", "branch_id": norte.id, "items": [{"inventory_id": inv.id, "cantidad": 1}]},
            headers=headers,
        )
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "BRANCH_NOT_ASSIGNED"

    def test_create_customer_from_sales_as_seller(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        cedula = valid_cedula(4242)
        created = client.post(
            f"{API}/sales/customers",
            json={
                "nombre": "Juan",
                "apellido": "Pérez",
                "email": "juan.perez@example.com",
                "identificacion": cedula,
                "celular": "0991234567",
                "provincia": "Pichincha",
                "ciudad": "Quito",
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        found = client.get(f"{API}/sales/customers/lookup", params={"identificacion": cedula}, headers=headers)
        assert found.json()["id"] == created.json()["id"]
        assert found.json()["celular"] == "0991234567"
        # Sellers still have no access to the Clientes module.
        assert client.get(f"{API}/clients", headers=headers).status_code == 403

    @pytest.mark.skipif(not IDENTIFICACION_VALIDATION_ENABLED, reason="cédula / RUC validation temporarily disabled")
    def test_customer_with_invalid_cedula_is_rejected(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        response = client.post(
            f"{API}/sales/customers",
            json={"nombre": "A", "apellido": "B", "email": "ab@example.com", "identificacion": "1712345678"},
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_IDENTIFICATION"

    @pytest.mark.skipif(IDENTIFICACION_VALIDATION_ENABLED, reason="only while cédula / RUC validation is disabled")
    def test_legacy_customer_with_any_identificacion_is_accepted(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        response = client.post(
            f"{API}/sales/customers",
            json={"nombre": "A", "apellido": "B", "identificacion": "11"},
            headers=headers,
        )
        assert response.status_code == 201, response.text
        assert response.json()["identificacion"] == "11"
        found = client.get(f"{API}/sales/customers/lookup", params={"identificacion": "11"}, headers=headers)
        assert found.status_code == 200, found.text

    def test_sale_shows_customer_phone(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        customer = factory.user(SystemRole.CLIENTE)
        inv = factory.inventory()
        sale = client.post(
            f"{API}/sales",
            json={"metodo_pago": "EFECTIVO", "branch_id": inv.branch_id, "items": [{"inventory_id": inv.id, "cantidad": 1}], "cliente_id": customer.id},
            headers=headers,
        ).json()
        assert sale["cliente"]["identificacion"] == customer.identificacion
        assert "celular" in sale["cliente"]


class TestUsersV3:
    def _payload(self, uow, **overrides):
        payload = {
            "nombre": "Vera",
            "apellido": "Vendedora",
            "email": "vera@example.com",
            "password": "Password123",
            "rol_id": _role_id(uow, "VENDEDOR"),
            "identificacion": valid_cedula(77),
            "provincia": "Pichincha",
            "ciudad": "Quito",
        }
        payload.update(overrides)
        return payload

    def test_seller_requires_at_least_one_branch(self, client, admin_headers, uow, factory):
        missing = client.post(f"{API}/users", json=self._payload(uow), headers=admin_headers)
        assert missing.status_code == 400
        assert missing.json()["error"]["code"] == "BRANCH_REQUIRED"
        norte = factory.branch("Norte")
        created = client.post(
            f"{API}/users",
            json=self._payload(uow, branch_ids=[factory.default_branch.id, norte.id]),
            headers=admin_headers,
        )
        assert created.status_code == 201, created.text
        assert sorted(b["nombre"] for b in created.json()["branches"]) == ["Matriz", "Norte"]

    def test_city_must_belong_to_province(self, client, admin_headers, uow, factory):
        response = client.post(
            f"{API}/users",
            json=self._payload(uow, ciudad="Guayaquil", branch_ids=[factory.default_branch.id]),
            headers=admin_headers,
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_CITY"

    def test_clients_never_keep_branches(self, client, admin_headers, uow, factory):
        created = client.post(
            f"{API}/users",
            json=self._payload(
                uow, rol_id=_role_id(uow, "CLIENTE"), password=None, branch_ids=[factory.default_branch.id]
            ),
            headers=admin_headers,
        )
        assert created.status_code == 201, created.text
        assert created.json()["branches"] == []

    def test_provinces_endpoint(self, client, admin_headers):
        provinces = client.get(f"{API}/locations/provinces", headers=admin_headers).json()
        assert len(provinces) == 24
        pichincha = next(p for p in provinces if p["nombre"] == "Pichincha")
        assert "Quito" in pichincha["ciudades"]
