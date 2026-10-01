"""Seller default password, cédula/RUC of the same person, inventory "add" that sums, sellers
creating products, payment (cash change / card surcharge), modifying sales (returns) and PDF receipts."""
from __future__ import annotations

import io
from decimal import Decimal

import pytest

from app.domain.entities import Sale
from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import PaymentMethod, SystemRole
from tests.conftest import auth_headers, valid_cedula

API = "/api/v1"


def _role_id(uow, name: str) -> int:
    return uow.roles.get_by_nombre(name).id


def _sale(client, headers, inv, cantidad=1, **extra):
    body = {
        "branch_id": inv.branch_id,
        "items": [{"inventory_id": inv.id, "cantidad": cantidad}],
        "metodo_pago": "EFECTIVO",
        **extra,
    }
    return client.post(f"{API}/sales", json=body, headers=headers)


# ------------------------------------------------------------------ domain: payment
class TestPayment:
    def _sale(self, total: str) -> Sale:
        sale = Sale(user_id=1)
        sale.add_line(product_id=1, cantidad=1, precio_unitario=Decimal(total))
        return sale

    def test_card_adds_6_percent(self):
        sale = self._sale("100.00")
        sale.apply_payment(PaymentMethod.TARJETA)
        assert (sale.recargo, sale.total_pagar) == (Decimal("6.00"), Decimal("106.00"))

    def test_card_surcharge_is_rounded_to_cents(self):
        sale = self._sale("19.99")
        sale.apply_payment(PaymentMethod.TARJETA)
        assert sale.recargo == Decimal("1.20")  # 1.1994
        assert sale.total_pagar == Decimal("21.19")

    def test_cash_change(self):
        sale = self._sale("45.50")
        sale.apply_payment(PaymentMethod.EFECTIVO, Decimal("50"))
        assert (sale.recargo, sale.monto_recibido, sale.cambio) == (Decimal("0.00"), Decimal("50.00"), Decimal("4.50"))

    def test_cash_received_must_cover_the_total(self):
        sale = self._sale("45.50")
        with pytest.raises(ValidationError) as exc:
            sale.apply_payment(PaymentMethod.EFECTIVO, Decimal("40"))
        assert exc.value.code == "INSUFFICIENT_PAYMENT"

    def test_transfer_has_no_surcharge_nor_change(self):
        sale = self._sale("10.00")
        sale.apply_payment(PaymentMethod.TRANSFERENCIA, Decimal("50"))
        assert (sale.total_pagar, sale.monto_recibido, sale.cambio) == (Decimal("10.00"), None, None)


# ------------------------------------------------------------------ users
class TestSellerPassword:
    def test_seller_default_password_is_the_cedula(self, client, admin_headers, uow, factory):
        cedula = valid_cedula(321)
        created = client.post(
            f"{API}/users",
            json={
                "nombre": "Vera",
                "apellido": "V",
                "email": "vera@example.com",
                "rol_id": _role_id(uow, "VENDEDOR"),
                "identificacion": cedula,
                "branch_ids": [factory.default_branch.id],
            },
            headers=admin_headers,
        )
        assert created.status_code == 201, created.text
        assert auth_headers(client, "vera@example.com", cedula)

    def test_seller_without_cedula_nor_password(self, client, admin_headers, uow, factory):
        response = client.post(
            f"{API}/users",
            json={
                "nombre": "Vera",
                "apellido": "V",
                "email": "vera@example.com",
                "rol_id": _role_id(uow, "VENDEDOR"),
                "branch_ids": [factory.default_branch.id],
            },
            headers=admin_headers,
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "IDENTIFICATION_REQUIRED"

    def test_cedula_and_ruc_of_the_same_person_are_rejected(self, client, admin_headers, factory):
        customer = factory.user(SystemRole.CLIENTE)  # has a cédula
        response = client.post(
            f"{API}/clients",
            json={
                "nombre": "X",
                "apellido": "Y",
                "email": "xy@example.com",
                "identificacion": f"{customer.identificacion}001",  # RUC of the same natural person
            },
            headers=admin_headers,
        )
        assert response.status_code == 409
        error = response.json()["error"]
        assert error["code"] == "IDENTIFICATION_ALREADY_EXISTS"
        assert error["details"] == {"field": "identificacion"}


# ------------------------------------------------------------------ products / inventory
class TestSellerCatalog:
    def test_seller_creates_products_and_uploads_the_image(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        category = factory.category()
        options = client.get(f"{API}/products/category-options", headers=headers).json()
        assert category.id in [c["id"] for c in options]
        created = client.post(
            f"{API}/products",
            json={
                "category_id": category.id,
                "sku": "MICA-01",
                "nombre": "Mica",
                "precio_venta": "5",
                "precio_costo": "1",
                "precio_mayor": "4",
            },
            headers=headers,
        )
        assert created.status_code == 201, created.text
        png = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
        image = client.put(
            f"{API}/products/{created.json()['id']}/image",
            files={"file": ("m.png", io.BytesIO(png), "image/png")},
            headers=headers,
        )
        assert image.status_code == 200, image.text
        edit = client.put(f"{API}/products/{created.json()['id']}", json={}, headers=headers)
        assert edit.status_code in (403, 422)

    def test_add_sums_when_the_product_is_already_in_the_branch(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        product = factory.product(stock=None)
        body = {"product_id": product.id, "branch_id": factory.default_branch.id, "stock": 4}
        first = client.post(f"{API}/inventory", json=body, headers=headers)
        assert first.status_code == 201 and first.json()["stock"] == 4
        second = client.post(f"{API}/inventory", json={**body, "stock": 3}, headers=headers)
        assert second.status_code == 200
        assert second.json()["id"] == first.json()["id"] and second.json()["stock"] == 7

    def test_seller_cannot_add_stock_to_other_branches(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        norte = factory.branch("Norte")
        product = factory.product(stock=None)
        response = client.post(
            f"{API}/inventory", json={"product_id": product.id, "branch_id": norte.id, "stock": 1}, headers=headers
        )
        assert response.status_code == 403


# ------------------------------------------------------------------ sales
class TestSalePayment:
    def test_card_and_cash(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        inv = factory.inventory(precio="50.00", stock=10)
        card = _sale(client, headers, inv, 2, metodo_pago="TARJETA").json()
        assert (card["total"], card["recargo"], card["total_pagar"]) == ("100.00", "6.00", "106.00")
        cash = _sale(client, headers, inv, 1, monto_recibido="60").json()
        assert (cash["total_pagar"], cash["monto_recibido"], cash["cambio"]) == ("50.00", "60.00", "10.00")
        short = _sale(client, headers, inv, 1, monto_recibido="20")
        assert short.status_code == 400 and short.json()["error"]["code"] == "INSUFFICIENT_PAYMENT"
        missing = client.post(
            f"{API}/sales",
            json={"branch_id": inv.branch_id, "items": [{"inventory_id": inv.id, "cantidad": 1}]},
            headers=headers,
        )
        assert missing.status_code == 422  # metodo_pago is required


class TestUpdateSale:
    def test_return_add_and_remove_lines_reconcile_stock(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        a = factory.inventory(precio="10.00", stock=10)
        b = factory.inventory(precio="25.00", stock=5)
        sale = client.post(
            f"{API}/sales",
            json={
                "branch_id": a.branch_id,
                "metodo_pago": "EFECTIVO",
                "items": [{"inventory_id": a.id, "cantidad": 4}],
            },
            headers=headers,
        ).json()
        assert client.get(f"{API}/inventory/{a.id}", headers=headers).json()["stock"] == 6

        # Return 3 units of A and add 2 of B, paid by card.
        updated = client.put(
            f"{API}/sales/{sale['id']}",
            json={
                "metodo_pago": "TARJETA",
                "items": [{"inventory_id": a.id, "cantidad": 1}, {"inventory_id": b.id, "cantidad": 2}],
            },
            headers=headers,
        )
        assert updated.status_code == 200, updated.text
        body = updated.json()
        assert body["total"] == "60.00" and body["recargo"] == "3.60" and body["total_pagar"] == "63.60"
        assert client.get(f"{API}/inventory/{a.id}", headers=headers).json()["stock"] == 9
        assert client.get(f"{API}/inventory/{b.id}", headers=headers).json()["stock"] == 3
        movements = client.get(f"{API}/inventory/{a.id}/movements", headers=headers).json()["items"]
        assert movements[0]["tipo"] == "DEVOLUCION" and movements[0]["cantidad"] == 3

        # Remove A completely.
        updated = client.put(
            f"{API}/sales/{sale['id']}",
            json={"metodo_pago": "TRANSFERENCIA", "items": [{"inventory_id": b.id, "cantidad": 2}]},
            headers=headers,
        ).json()
        assert [d["inventory_id"] for d in updated["details"]] == [b.id]
        assert client.get(f"{API}/inventory/{a.id}", headers=headers).json()["stock"] == 10

    def test_update_validates_stock(self, client, factory):
        headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
        inv = factory.inventory(stock=2)
        sale = _sale(client, headers, inv, 1).json()
        response = client.put(
            f"{API}/sales/{sale['id']}",
            json={"metodo_pago": "EFECTIVO", "items": [{"inventory_id": inv.id, "cantidad": 5}]},
            headers=headers,
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "INSUFFICIENT_STOCK"
        assert client.get(f"{API}/inventory/{inv.id}", headers=headers).json()["stock"] == 1  # rolled back

    def test_cancelled_sale_cannot_be_modified(self, client, admin_headers, factory):
        inv = factory.inventory(stock=2)
        sale = _sale(client, admin_headers, inv, 1).json()
        client.post(f"{API}/sales/{sale['id']}/cancel", headers=admin_headers)
        response = client.put(
            f"{API}/sales/{sale['id']}",
            json={"metodo_pago": "EFECTIVO", "items": [{"inventory_id": inv.id, "cantidad": 1}]},
            headers=admin_headers,
        )
        assert response.status_code == 409
        assert response.json()["error"]["code"] == "SALE_NOT_EDITABLE"


class TestReceipt:
    def test_pdf_receipt(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        customer = factory.user(SystemRole.CLIENTE)
        inv = factory.inventory(precio="19.99", stock=3)
        sale = _sale(client, headers, inv, 2, metodo_pago="TARJETA", factura=True, cliente_id=customer.id).json()
        response = client.get(f"{API}/sales/{sale['id']}/receipt", headers=headers)
        assert response.status_code == 200
        assert response.headers["content-type"] == "application/pdf"
        assert response.content.startswith(b"%PDF")
        assert f"comprobante-{sale['id']:06d}.pdf" in response.headers["content-disposition"]

    def test_receipt_requires_authentication(self, client):
        assert client.get(f"{API}/sales/1/receipt").status_code == 401


def test_seller_photo_in_sales_list(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    inv = factory.inventory()
    _sale(client, headers, inv)
    listed = client.get(f"{API}/sales", headers=headers).json()["items"][0]
    assert listed["user"]["id"] == seller.id
    assert "foto_url" in listed["user"]
