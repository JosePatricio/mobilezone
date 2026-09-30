"""Endpoints for the second set of requirements: roles instead of user types, new user fields,
products with SKU / three prices / image, and sales with factura / comprobante and client lookup."""
from __future__ import annotations

import io
from pathlib import Path

from app.domain.value_objects.enums import SystemRole
from tests.conftest import PASSWORD, auth_headers

API = "/api/v1"

PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 64
JPG = b"\xff\xd8\xff\xe0" + b"\x00" * 64


def _upload(content: bytes, name: str = "foto.png", content_type: str = "image/png"):
    return {"file": (name, io.BytesIO(content), content_type)}


def _role_id(uow, name: str) -> int:
    return uow.roles.get_by_nombre(name).id


# ------------------------------------------------------------------ roles / users
class TestUsersAndRoles:
    def test_vendedor_only_has_sales_and_products(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        body = client.post(f"{API}/auth/login", json={"email": seller.email, "password": PASSWORD}).json()
        assert sorted(body["permissions"]) == ["products.view", "sales.create", "sales.view"]
        assert body["user"]["role"]["nombre"] == "VENDEDOR"
        headers = {"Authorization": f"Bearer {body['access_token']}"}
        assert client.get(f"{API}/products", headers=headers).status_code == 200
        assert client.get(f"{API}/sales", headers=headers).status_code == 200
        for path in ("/clients", "/users", "/work-orders", "/categories"):
            assert client.get(f"{API}{path}", headers=headers).status_code == 403, path

    def test_create_user_with_new_fields(self, client, admin_headers, uow):
        response = client.post(
            f"{API}/users",
            json={
                "nombre": "Vera",
                "apellido": "Díaz",
                "email": "vera@example.com",
                "password": "Password123",
                "rol_id": _role_id(uow, "VENDEDOR"),
                "identificacion": "1790012345001",
                "celular": "099 123 4567",
                "ciudad": "Quito",
            },
            headers=admin_headers,
        )
        assert response.status_code == 201, response.text
        user = response.json()
        assert "tipo_usuario" not in user and "password" not in user
        assert user["role"]["nombre"] == "VENDEDOR"
        assert user["identificacion"] == "1790012345001"
        assert user["celular"] == "0991234567"
        assert user["foto_url"] is None  # the frontend shows the default avatar

    def test_invalid_and_duplicated_identificacion(self, client, admin_headers, uow, factory):
        base = {
            "nombre": "A",
            "apellido": "B",
            "password": "Password123",
            "rol_id": _role_id(uow, "VENDEDOR"),
        }
        bad = client.post(f"{API}/users", json={**base, "email": "a@example.com", "identificacion": "123"}, headers=admin_headers)
        assert bad.status_code == 422
        existing = factory.user(SystemRole.CLIENTE)
        dup = client.post(
            f"{API}/users",
            json={**base, "email": "b@example.com", "identificacion": existing.identificacion},
            headers=admin_headers,
        )
        assert dup.status_code == 409
        assert dup.json()["error"]["code"] == "IDENTIFICATION_ALREADY_EXISTS"

    def test_password_required_except_for_clients(self, client, admin_headers, uow):
        base = {"nombre": "A", "apellido": "B", "identificacion": "0102030405"}
        seller = client.post(
            f"{API}/users",
            json={**base, "email": "s@example.com", "rol_id": _role_id(uow, "VENDEDOR")},
            headers=admin_headers,
        )
        assert seller.status_code == 400
        assert seller.json()["error"]["code"] == "PASSWORD_REQUIRED"
        customer = client.post(
            f"{API}/users",
            json={**base, "email": "c@example.com", "rol_id": _role_id(uow, "CLIENTE")},
            headers=admin_headers,
        )
        assert customer.status_code == 201

    def test_system_roles_are_protected(self, client, admin_headers, uow):
        vendedor = _role_id(uow, "VENDEDOR")
        rename = client.put(f"{API}/roles/{vendedor}", json={"nombre": "OTRO"}, headers=admin_headers)
        assert rename.status_code == 400
        assert rename.json()["error"]["code"] == "SYSTEM_ROLE_PROTECTED"
        assert client.patch(f"{API}/roles/{vendedor}/status", json={"estado": False}, headers=admin_headers).status_code == 400
        assert client.delete(f"{API}/roles/{vendedor}", headers=admin_headers).status_code == 400
        # permissions of a system role can still be edited
        assert client.put(f"{API}/roles/{vendedor}/permissions", json={"permission_ids": []}, headers=admin_headers).status_code == 200

    def test_users_filtered_by_role(self, client, admin_headers, factory, uow):
        tech = factory.user(SystemRole.TECNICO)
        factory.user(SystemRole.VENDEDOR)
        body = client.get(f"{API}/users", params={"rol_id": _role_id(uow, "TECNICO")}, headers=admin_headers).json()
        assert [u["id"] for u in body["items"]] == [tech.id]

    def test_user_photo_upload_and_delete(self, client, admin_headers, factory, settings):
        user = factory.user(SystemRole.TECNICO)
        uploaded = client.put(f"{API}/users/{user.id}/photo", files=_upload(PNG), headers=admin_headers)
        assert uploaded.status_code == 200, uploaded.text
        url = uploaded.json()["foto_url"]
        assert url.startswith("/media/users/") and url.endswith(".png")
        stored = Path(settings.media_dir) / url.removeprefix("/media/")
        assert stored.read_bytes() == PNG
        assert client.get(url).status_code == 200  # served by the API

        replaced = client.put(f"{API}/users/{user.id}/photo", files=_upload(JPG, "f.jpg", "image/jpeg"), headers=admin_headers)
        assert replaced.json()["foto_url"].endswith(".jpg")
        assert not stored.exists()  # the previous file is removed

        removed = client.delete(f"{API}/users/{user.id}/photo", headers=admin_headers)
        assert removed.json()["foto_url"] is None

    def test_photo_rejects_non_images(self, client, admin_headers, factory):
        user = factory.user(SystemRole.TECNICO)
        fake = client.put(f"{API}/users/{user.id}/photo", files=_upload(b"not an image"), headers=admin_headers)
        assert fake.status_code == 400
        assert fake.json()["error"]["code"] == "INVALID_IMAGE"
        big = client.put(f"{API}/users/{user.id}/photo", files=_upload(PNG + b"0" * (2 * 1024 * 1024)), headers=admin_headers)
        assert big.json()["error"]["code"] == "IMAGE_TOO_LARGE"

    def test_clients_require_identificacion(self, client, admin_headers):
        payload = {"nombre": "Juan", "apellido": "Pérez", "email": "juan2@example.com"}
        assert client.post(f"{API}/clients", json=payload, headers=admin_headers).status_code == 422
        created = client.post(
            f"{API}/clients",
            json={**payload, "identificacion": "0911111111", "celular": "0987654321", "ciudad": "Guayaquil"},
            headers=admin_headers,
        )
        assert created.status_code == 201
        assert created.json()["ciudad"] == "Guayaquil"


# ------------------------------------------------------------------ products
class TestProductsV2:
    def _payload(self, category_id: int, **overrides):
        payload = {
            "category_id": category_id,
            "sku": "PAN-001",
            "nombre": "Pantalla",
            "precio_venta": "85.00",
            "precio_costo": "50.00",
            "precio_mayor": "75.00",
        }
        payload.update(overrides)
        return payload

    def test_three_prices_and_unique_sku(self, client, admin_headers, factory):
        category = factory.category()
        created = client.post(f"{API}/products", json=self._payload(category.id), headers=admin_headers)
        assert created.status_code == 201, created.text
        product = created.json()
        assert (product["precio_venta"], product["precio_costo"], product["precio_mayor"]) == ("85.00", "50.00", "75.00")
        assert product["stock"] == 0

        dup = client.post(f"{API}/products", json=self._payload(category.id, sku="pan-001"), headers=admin_headers)
        assert dup.status_code == 409
        assert dup.json()["error"]["code"] == "SKU_ALREADY_EXISTS"

        with_stock = client.post(f"{API}/products", json=self._payload(category.id, sku="X2", stock=5), headers=admin_headers)
        assert with_stock.status_code == 422  # there is no initial stock field anymore

        found = client.get(f"{API}/products", params={"search": "pan-0"}, headers=admin_headers).json()
        assert found["total"] == 1

    def test_product_image(self, client, admin_headers, factory):
        product = factory.product()
        uploaded = client.put(f"{API}/products/{product.id}/image", files=_upload(PNG), headers=admin_headers)
        assert uploaded.status_code == 200, uploaded.text
        assert uploaded.json()["imagen_url"].startswith("/media/products/")
        listed = client.get(f"{API}/products", headers=admin_headers).json()["items"][0]
        assert listed["imagen_url"] == uploaded.json()["imagen_url"]
        removed = client.delete(f"{API}/products/{product.id}/image", headers=admin_headers)
        assert removed.json()["imagen_url"] is None

    def test_sale_uses_pvp(self, client, admin_headers, factory):
        product = factory.product(precio="20.00")
        sale = client.post(
            f"{API}/sales", json={"items": [{"product_id": product.id, "cantidad": 2}]}, headers=admin_headers
        ).json()
        assert sale["total"] == "40.00"


# ------------------------------------------------------------------ sales
class TestSalesV2:
    def test_lookup_customer_by_identificacion(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        customer = factory.user(SystemRole.CLIENTE)
        found = client.get(
            f"{API}/sales/customers/lookup", params={"identificacion": customer.identificacion}, headers=headers
        )
        assert found.status_code == 200, found.text
        assert (found.json()["nombre"], found.json()["apellido"]) == (customer.nombre, customer.apellido)

        missing = client.get(f"{API}/sales/customers/lookup", params={"identificacion": "0999999999"}, headers=headers)
        assert missing.status_code == 404
        assert missing.json()["error"]["code"] == "CLIENT_NOT_FOUND"

        staff = factory.user(SystemRole.TECNICO)
        staff_lookup = client.get(f"{API}/sales/customers/lookup", params={"identificacion": "1"}, headers=headers)
        assert staff_lookup.status_code == 400  # invalid cedula format
        assert staff.identificacion is None

    def test_factura_with_client_and_consumidor_final(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        customer = factory.user(SystemRole.CLIENTE)
        product = factory.product(stock=5)

        invoice = client.post(
            f"{API}/sales",
            json={"items": [{"product_id": product.id, "cantidad": 1}], "factura": True, "cliente_id": customer.id},
            headers=headers,
        ).json()
        assert invoice["factura"] is True
        assert invoice["cliente"]["identificacion"] == customer.identificacion

        receipt = client.post(
            f"{API}/sales", json={"items": [{"product_id": product.id, "cantidad": 1}]}, headers=headers
        ).json()
        assert receipt["factura"] is False
        assert receipt["cliente"] is None  # consumidor final

    def test_sale_client_must_be_a_client(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        product = factory.product()
        response = client.post(
            f"{API}/sales",
            json={"items": [{"product_id": product.id, "cantidad": 1}], "cliente_id": seller.id},
            headers=headers,
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "INVALID_CLIENT"
