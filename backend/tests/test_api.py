"""HTTP endpoint tests: authentication, authorization, error format and main flows."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import PASSWORD, auth_headers

API = "/api/v1"


# ------------------------------------------------------------------ auth
class TestAuth:
    def test_login_and_me(self, client, settings):
        response = client.post(f"{API}/auth/login", json={"email": settings.admin_email, "password": PASSWORD})
        assert response.status_code == 200
        body = response.json()
        assert body["token_type"] == "bearer"
        assert "password" not in body["user"]
        assert "users.create" in body["permissions"]

        me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {body['access_token']}"})
        assert me.status_code == 200
        assert me.json()["user"]["email"] == settings.admin_email

    def test_invalid_credentials(self, client, settings):
        response = client.post(f"{API}/auth/login", json={"email": settings.admin_email, "password": "wrong-pass"})
        assert response.status_code == 401
        assert response.json() == {"error": {"code": "INVALID_CREDENTIALS", "message": "Credenciales inválidas."}}

    def test_unauthenticated(self, client):
        response = client.get(f"{API}/products")
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "NOT_AUTHENTICATED"

    def test_invalid_token(self, client):
        response = client.get(f"{API}/products", headers={"Authorization": "Bearer nope"})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "INVALID_TOKEN"

    def test_inactive_user_cannot_login(self, client, factory):
        user = factory.user(SystemRole.VENDEDOR, estado=False)
        response = client.post(f"{API}/auth/login", json={"email": user.email, "password": PASSWORD})
        assert response.status_code == 401
        assert response.json()["error"]["code"] == "USER_INACTIVE"

    def test_client_without_password_cannot_login(self, client, factory):
        c = factory.user(SystemRole.CLIENTE)
        response = client.post(f"{API}/auth/login", json={"email": c.email, "password": PASSWORD})
        assert response.status_code == 401


# --------------------------------------------------------- authorization
class TestAuthorization:
    def test_insufficient_permission(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        response = client.post(f"{API}/categories", json={"nombre": "X"}, headers=headers)
        assert response.status_code == 403
        assert response.json()["error"]["code"] == "FORBIDDEN"

    def test_permission_granted(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        assert client.get(f"{API}/products", headers=headers).status_code == 200


# -------------------------------------------------------------- catalog
class TestCatalog:
    def test_category_crud(self, client, admin_headers):
        created = client.post(
            f"{API}/categories", json={"nombre": "Pantallas", "descripcion": "LCD"}, headers=admin_headers
        )
        assert created.status_code == 201
        cid = created.json()["id"]

        dup = client.post(f"{API}/categories", json={"nombre": "pantallas"}, headers=admin_headers)
        assert dup.status_code == 409
        assert dup.json()["error"]["code"] == "CATEGORY_ALREADY_EXISTS"

        updated = client.put(
            f"{API}/categories/{cid}", json={"nombre": "Displays", "estado": True}, headers=admin_headers
        )
        assert updated.json()["nombre"] == "Displays"

        toggled = client.patch(f"{API}/categories/{cid}/status", json={"estado": False}, headers=admin_headers)
        assert toggled.json()["estado"] is False

        listed = client.get(f"{API}/categories", params={"search": "disp"}, headers=admin_headers).json()
        assert listed["total"] == 1 and listed["items"][0]["id"] == cid

    def test_category_with_products_cannot_be_deleted(self, client, admin_headers, factory):
        product = factory.product()
        response = client.delete(f"{API}/categories/{product.category_id}", headers=admin_headers)
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "ENTITY_IN_USE"

    def test_validation_error_format(self, client, admin_headers):
        response = client.post(f"{API}/categories", json={"nombre": ""}, headers=admin_headers)
        assert response.status_code == 422
        error = response.json()["error"]
        assert error["code"] == "VALIDATION_ERROR"
        assert error["details"][0]["field"] == "nombre"

    def test_not_found(self, client, admin_headers):
        response = client.get(f"{API}/brands/999", headers=admin_headers)
        assert response.status_code == 404
        assert response.json()["error"]["code"] == "BRAND_NOT_FOUND"

    def test_models_filtered_by_brand(self, client, admin_headers, factory):
        brand, model = factory.brand_and_model()
        factory.brand_and_model()
        body = client.get(f"{API}/models", params={"brand_id": brand.id}, headers=admin_headers).json()
        assert [m["id"] for m in body["items"]] == [model.id]
        assert body["items"][0]["brand"]["nombre"] == brand.nombre

    def test_spare_part_crud(self, client, admin_headers):
        created = client.post(
            f"{API}/spare-parts",
            json={"tipo": "Batería", "ubicacion": True, "precio": "25.50", "garantia": True},
            headers=admin_headers,
        )
        assert created.status_code == 201
        assert created.json()["precio"] == "25.50"
        assert created.json()["ubicacion"] is True


# ------------------------------------------------------------- products
class TestProducts:
    def test_create_and_stock(self, client, admin_headers, factory):
        category = factory.category()
        created = client.post(
            f"{API}/products",
            json={
                "category_id": category.id,
                "sku": "cargador-usbc",
                "nombre": "Cargador",
                "precio_venta": "12.50",
                "precio_costo": "7.00",
                "precio_mayor": "10.00",
            },
            headers=admin_headers,
        )
        assert created.status_code == 201, created.text
        pid = created.json()["id"]
        assert created.json()["category"]["nombre"] == category.nombre

        assert created.json()["sku"] == "CARGADOR-USBC"
        assert created.json()["imagen_url"] is None
        assert created.json()["stock"] == 0  # stock lives in the branch inventory

        branch_id = factory.default_branch.id
        inv = client.post(
            f"{API}/inventory", json={"product_id": pid, "branch_id": branch_id, "stock": 4}, headers=admin_headers
        )
        assert inv.status_code == 201, inv.text
        inv_id = inv.json()["id"]
        # The product is already in the branch: "Agregar" adds the units to its stock.
        again = client.post(
            f"{API}/inventory", json={"product_id": pid, "branch_id": branch_id, "stock": 1}, headers=admin_headers
        )
        assert again.status_code == 200
        assert again.json()["id"] == inv_id and again.json()["stock"] == 5
        client.patch(f"{API}/inventory/{inv_id}/stock", json={"cantidad": -1}, headers=admin_headers)

        adjusted = client.patch(
            f"{API}/inventory/{inv_id}/stock", json={"cantidad": -5, "motivo": "rotura"}, headers=admin_headers
        )
        assert adjusted.status_code == 409
        assert adjusted.json()["error"]["code"] == "INSUFFICIENT_STOCK"

        adjusted = client.patch(f"{API}/inventory/{inv_id}/stock", json={"cantidad": 6}, headers=admin_headers)
        assert adjusted.json()["stock"] == 10
        assert client.get(f"{API}/products/{pid}", headers=admin_headers).json()["stock"] == 10

        movements = client.get(f"{API}/inventory/{inv_id}/movements", headers=admin_headers).json()
        assert movements["total"] == 4  # initial stock + entry + 2 adjustments

    def test_negative_price_rejected(self, client, admin_headers, factory):
        category = factory.category()
        response = client.post(
            f"{API}/products",
            json={
                "category_id": category.id,
                "sku": "X1",
                "nombre": "X",
                "precio_venta": "-1",
                "precio_costo": "0",
                "precio_mayor": "0",
            },
            headers=admin_headers,
        )
        assert response.status_code == 422

    def test_filters(self, client, admin_headers, factory):
        cat = factory.category()
        factory.product(category=cat)
        factory.product(estado=False)
        body = client.get(f"{API}/products", params={"category_id": cat.id}, headers=admin_headers).json()
        assert body["total"] == 1
        body = client.get(f"{API}/products", params={"estado": False}, headers=admin_headers).json()
        assert body["total"] == 1


# ---------------------------------------------------------------- sales
class TestSales:
    def test_sale_flow(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        a = factory.inventory(precio="10.00", stock=10)
        b = factory.inventory(precio="25.00", stock=1)
        branch_id = factory.default_branch.id

        response = client.post(
            f"{API}/sales",
            json={
                "branch_id": branch_id,
                "metodo_pago": "EFECTIVO",
                "items": [{"inventory_id": a.id, "cantidad": 2}, {"inventory_id": b.id, "cantidad": 1}],
            },
            headers=headers,
        )
        assert response.status_code == 201, response.text
        sale = response.json()
        assert sale["total"] == "45.00"
        assert sale["user"]["id"] == seller.id
        assert len(sale["details"]) == 2

        assert sale["branch"]["id"] == branch_id
        assert client.get(f"{API}/inventory/{a.id}", headers=headers).json()["stock"] == 8

        response = client.post(
            f"{API}/sales",
            json={"metodo_pago": "EFECTIVO", "branch_id": branch_id, "items": [{"inventory_id": b.id, "cantidad": 1}]},
            headers=headers,
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"

    def test_cancel_requires_permission(self, client, factory, admin_headers):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        inv = factory.inventory(stock=2)
        sale = client.post(
            f"{API}/sales",
            json={"metodo_pago": "EFECTIVO", "branch_id": inv.branch_id, "items": [{"inventory_id": inv.id, "cantidad": 2}]},
            headers=headers,
        ).json()
        assert client.post(f"{API}/sales/{sale['id']}/cancel", headers=headers).status_code == 403
        cancelled = client.post(f"{API}/sales/{sale['id']}/cancel", headers=admin_headers)
        assert cancelled.json()["estado"] == "ANULADA"
        assert client.get(f"{API}/inventory/{inv.id}", headers=admin_headers).json()["stock"] == 2

    def test_empty_sale_rejected(self, client, admin_headers):
        response = client.post(f"{API}/sales", json={"metodo_pago": "EFECTIVO", "branch_id": 1, "items": []}, headers=admin_headers)
        assert response.status_code == 422


# ---------------------------------------------------------- work orders
class TestWorkOrders:
    def _payload(self, factory, **overrides):
        client_user = factory.user(SystemRole.CLIENTE)
        brand, model = factory.brand_and_model()
        payload = {
            "cliente": {
                "identificacion": client_user.identificacion,
                "nombre": client_user.nombre,
                "apellido": client_user.apellido,
            },
            "marca_id": brand.id,
            "modelo_id": model.id,
            "motivo_ingreso": "DIAGNOSTICO",
            "observacion": "No enciende",
            "color": "Negro",
            "presupuesto": "100.00",
            "anticipo": "30.00",
        }
        payload.update(overrides)
        return payload

    def test_create_as_technician(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        response = client.post(f"{API}/work-orders", json=self._payload(factory), headers=headers)
        assert response.status_code == 201, response.text
        order = response.json()
        assert order["saldo"] == "70.00"
        assert order["tecnico"]["id"] == tech.id
        assert order["user"]["id"] == tech.id
        assert order["estado"] == 0 and order["estado_label"]

        by_number = client.get(f"{API}/work-orders/by-number/{order['num_orden']}", headers=headers)
        assert by_number.json()["id"] == order["id"]

    def test_saldo_cannot_be_forced_by_client(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        response = client.post(
            f"{API}/work-orders", json=self._payload(factory, saldo="1.00"), headers=headers
        )
        assert response.status_code == 422  # extra fields are forbidden

    def test_advance_exceeding_budget(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        response = client.post(
            f"{API}/work-orders", json=self._payload(factory, anticipo="200.00"), headers=headers
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "ADVANCE_EXCEEDS_BUDGET"

    def test_invalid_status(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        response = client.post(f"{API}/work-orders", json=self._payload(factory, estado=5), headers=headers)
        assert response.status_code == 422

    def test_spare_parts_and_filters(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        order = client.post(f"{API}/work-orders", json=self._payload(factory), headers=headers).json()
        part = factory.spare_part(precio="85.00")

        added = client.post(
            f"{API}/work-orders/{order['id']}/spare-parts",
            json={"spare_part_id": part.id, "cantidad": 1},
            headers=headers,
        )
        assert added.status_code == 201, added.text
        assert added.json()["technician"]["id"] == tech.id

        detail = client.get(f"{API}/work-orders/{order['id']}", headers=headers).json()
        assert detail["spare_parts_total"] == "85.00"

        removed = client.delete(f"{API}/work-orders/{order['id']}/spare-parts/{added.json()['id']}", headers=headers)
        assert removed.status_code == 204

        listed = client.get(f"{API}/work-orders", params={"tecnico_id": tech.id, "estado": 0}, headers=headers)
        assert listed.json()["total"] == 1
        listed = client.get(f"{API}/work-orders", params={"cliente": "nombre"}, headers=headers)
        assert listed.json()["total"] == 1

        status = client.patch(f"{API}/work-orders/{order['id']}/status", json={"estado": 2}, headers=headers)
        assert status.json()["estado"] == 2

    def test_statuses_endpoint(self, client, admin_headers):
        statuses = client.get(f"{API}/work-orders/statuses", headers=admin_headers).json()
        assert [s["value"] for s in statuses] == [0, 1, 2]

    def test_calculate_balance(self, client, admin_headers):
        response = client.post(
            f"{API}/work-orders/calculate-balance",
            json={"presupuesto": "100", "anticipo": "30"},
            headers=admin_headers,
        )
        assert response.json()["saldo"] == "70.00"


# ------------------------------------------------------ users and roles
class TestUsersAndRoles:
    def test_create_user_never_returns_password(self, client, admin_headers, uow):
        role = uow.roles.get_by_nombre("TECNICO")
        response = client.post(
            f"{API}/users",
            json={
                "nombre": "Tec",
                "apellido": "Nico",
                "email": "tec@x.com",
                "password": "Password123",
                "rol_id": role.id,
                "identificacion": "1712345675",
                "celular": "0991234567",
                "provincia": "Pichincha",
                "ciudad": "Quito",
            },
            headers=admin_headers,
        )
        assert response.status_code == 201, response.text
        assert "password" not in response.json()
        assert auth_headers(client, "tec@x.com", "Password123")

    def test_duplicate_email(self, client, admin_headers, settings, uow):
        response = client.post(
            f"{API}/users",
            json={
                "nombre": "A",
                "apellido": "B",
                "email": settings.admin_email,
                "password": "Password123",
                "rol_id": uow.roles.get_by_nombre("VENDEDOR").id,
            },
            headers=admin_headers,
        )
        assert response.status_code == 409

    def test_cannot_deactivate_self(self, client, admin_headers):
        me = client.get(f"{API}/auth/me", headers=admin_headers).json()["user"]
        response = client.patch(f"{API}/users/{me['id']}/status", json={"estado": False}, headers=admin_headers)
        assert response.status_code == 400

    def test_role_permissions(self, client, admin_headers):
        permissions = client.get(f"{API}/permissions", headers=admin_headers).json()
        ids = [p["id"] for p in permissions if p["codigo"].startswith("products.")]
        role = client.post(
            f"{API}/roles", json={"nombre": "bodega", "permission_ids": ids}, headers=admin_headers
        ).json()
        assert role["nombre"] == "BODEGA"
        assert len(role["permissions"]) == len(ids)
        role = client.put(f"{API}/roles/{role['id']}/permissions", json={"permission_ids": ids[:1]}, headers=admin_headers)
        assert len(role.json()["permissions"]) == 1

    def test_clients_endpoint(self, client, admin_headers, factory):
        factory.user(SystemRole.CLIENTE)
        factory.user(SystemRole.TECNICO)
        body = client.get(f"{API}/clients", headers=admin_headers).json()
        assert body["total"] == 1
        created = client.post(
            f"{API}/clients",
            json={"nombre": "Juan", "apellido": "Pérez", "email": "juan@x.com", "identificacion": "0102030400"},
            headers=admin_headers,
        )
        assert created.status_code == 201

    def test_technicians_endpoint(self, client, admin_headers, factory):
        tech = factory.user(SystemRole.TECNICO)
        body = client.get(f"{API}/users/technicians", headers=admin_headers).json()
        assert [t["id"] for t in body] == [tech.id]
