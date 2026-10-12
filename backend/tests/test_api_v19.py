"""Proveedores (suppliers of the products) and the discount of the sales."""
from __future__ import annotations

from decimal import Decimal

import pytest

from app.domain.entities import Sale, Supplier
from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import PaymentMethod, SystemRole
from tests.conftest import auth_headers
from tests.test_api_v4 import _sale

API = "/api/v1"
SUPPLIERS = f"{API}/suppliers"


# ------------------------------------------------------------------ domain: discount
class TestDiscount:
    def _sale(self, total: str) -> Sale:
        sale = Sale(user_id=1)
        sale.add_line(product_id=1, cantidad=1, precio_unitario=Decimal(total))
        return sale

    def test_discount_is_subtracted_from_the_amount_to_pay(self):
        sale = self._sale("50.00")
        sale.apply_discount(Decimal("5"))
        sale.apply_payment(PaymentMethod.EFECTIVO, Decimal("50"))
        assert (sale.total, sale.descuento, sale.total_pagar) == (Decimal("50.00"), Decimal("5.00"), Decimal("45.00"))
        assert sale.cambio == Decimal("5.00")

    def test_card_surcharge_is_computed_after_the_discount(self):
        sale = self._sale("100.00")
        sale.apply_discount(Decimal("10"))
        sale.apply_payment(PaymentMethod.TARJETA)
        assert (sale.recargo, sale.total_pagar) == (Decimal("5.40"), Decimal("95.40"))

    @pytest.mark.parametrize("descuento", ["-1", "50.01"])
    def test_discount_must_be_between_zero_and_the_total(self, descuento):
        with pytest.raises(ValidationError):
            self._sale("50.00").apply_discount(Decimal(descuento))


def test_supplier_normalizes_optional_fields():
    supplier = Supplier(nombre="  Distribuidora  ", ruc=" ", telefono=" 0991234567 ")
    assert (supplier.nombre, supplier.ruc, supplier.telefono) == ("Distribuidora", None, "0991234567")


# ------------------------------------------------------------------ API: sales with discount
def test_sale_with_discount(client, admin_headers, factory):
    inv = factory.inventory(precio="20.00", stock=5)
    response = _sale(client, admin_headers, inv, cantidad=2, descuento="4.50", monto_recibido="40")
    assert response.status_code == 201, response.text
    sale = response.json()
    assert (sale["total"], sale["descuento"], sale["total_pagar"]) == ("40.00", "4.50", "35.50")
    assert sale["cambio"] == "4.50"
    assert sale["branch"]["ubicacion"]  # contact data of the branch for the printed receipt

    updated = client.put(
        f"{API}/sales/{sale['id']}",
        json={"items": [{"inventory_id": inv.id, "cantidad": 1}], "metodo_pago": "TRANSFERENCIA", "descuento": "0"},
        headers=admin_headers,
    )
    assert updated.status_code == 200, updated.text
    assert (updated.json()["descuento"], updated.json()["total_pagar"]) == ("0.00", "20.00")


def test_discount_cannot_exceed_the_total(client, admin_headers, factory):
    inv = factory.inventory(precio="10.00", stock=5)
    response = _sale(client, admin_headers, inv, descuento="10.01")
    assert response.status_code in (400, 422)
    assert response.json()["error"]["code"] == "INVALID_DISCOUNT"


# ------------------------------------------------------------------ API: suppliers
def test_supplier_crud_and_product_supplier(client, admin_headers, factory):
    created = client.post(
        SUPPLIERS, json={"nombre": "Distribuidora Andina", "ruc": "1790012345001", "telefono": "022345678"},
        headers=admin_headers,
    )
    assert created.status_code == 201, created.text
    supplier = created.json()
    assert supplier["estado"] is True and supplier["email"] is None

    duplicated = client.post(SUPPLIERS, json={"nombre": "distribuidora andina"}, headers=admin_headers)
    assert duplicated.status_code == 409
    assert duplicated.json()["error"]["code"] == "SUPPLIER_ALREADY_EXISTS"

    found = client.get(SUPPLIERS, params={"search": "17900"}, headers=admin_headers).json()
    assert [s["id"] for s in found["items"]] == [supplier["id"]]

    options = client.get(f"{API}/products/supplier-options", headers=admin_headers).json()
    assert {"id": supplier["id"], "nombre": "Distribuidora Andina"} in options

    category = factory.category()
    body = {
        "category_id": category.id,
        "supplier_id": supplier["id"],
        "sku": "PROV-1",
        "nombre": "Cargador",
        "precio_venta": "10",
        "precio_costo": "5",
        "precio_mayor": "8",
    }
    product = client.post(f"{API}/products", json=body, headers=admin_headers)
    assert product.status_code == 201, product.text
    assert product.json()["supplier"] == {"id": supplier["id"], "nombre": "Distribuidora Andina"}

    # A supplier with products cannot be deleted: it is deactivated instead.
    assert client.delete(f"{SUPPLIERS}/{supplier['id']}", headers=admin_headers).status_code == 409
    off = client.patch(f"{SUPPLIERS}/{supplier['id']}/status", json={"estado": False}, headers=admin_headers)
    assert off.json()["estado"] is False
    inactive = client.post(f"{API}/products", json={**body, "sku": "PROV-2"}, headers=admin_headers)
    assert inactive.json()["error"]["code"] == "SUPPLIER_INACTIVE"
    # The product keeps its (now inactive) supplier when it is edited.
    kept = client.put(f"{API}/products/{product.json()['id']}", json=body, headers=admin_headers)
    assert kept.status_code == 200, kept.text


def test_product_without_supplier(client, admin_headers, factory):
    body = {
        "category_id": factory.category().id,
        "sku": "SINPROV",
        "nombre": "Funda",
        "precio_venta": "5",
        "precio_costo": "2",
        "precio_mayor": "4",
    }
    product = client.post(f"{API}/products", json=body, headers=admin_headers)
    assert product.status_code == 201, product.text
    assert product.json()["supplier"] is None


def test_sellers_cannot_manage_suppliers_but_see_the_options(client, factory):
    headers = auth_headers(client, factory.user(SystemRole.VENDEDOR).email)
    assert client.get(SUPPLIERS, headers=headers).status_code == 403
    assert client.post(SUPPLIERS, json={"nombre": "X"}, headers=headers).status_code == 403
    assert client.get(f"{API}/products/supplier-options", headers=headers).status_code == 200
