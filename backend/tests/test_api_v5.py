"""Work orders v5 (client by cédula, entry reason, warranty, pattern / PIN, photos, public QR page)
and sales v5 (local-day filters, cédula filter, today's summary of the seller)."""
from __future__ import annotations

import io
from datetime import datetime

import pytest
from sqlalchemy import update

from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import SystemRole
from app.domain.value_objects.work_orders import validate_lock
from app.infrastructure.database.tables import sales_table
from tests.conftest import auth_headers, valid_cedula

API = "/api/v1"
PNG = b"\x89PNG\r\n\x1a\n" + b"\x00" * 32


def _png():
    return {"file": ("foto.png", io.BytesIO(PNG), "image/png")}


# ------------------------------------------------------------------ domain: lock
class TestLock:
    def test_pattern_is_normalized(self):
        assert validate_lock("PATRON", " 1-5-9-6 ") == ("PATRON", "1-5-9-6")

    @pytest.mark.parametrize("value", ["1-2-3", "1-1-2-3", "0-1-2-3", "1-2-3-4-5-6-7-8-9-1", "abc"])
    def test_invalid_pattern(self, value):
        with pytest.raises(ValidationError) as exc:
            validate_lock("PATRON", value)
        assert exc.value.code == "INVALID_PATTERN"

    @pytest.mark.parametrize("value", ["123", "12a4", "1234567890123"])
    def test_invalid_pin(self, value):
        with pytest.raises(ValidationError) as exc:
            validate_lock("PIN", value)
        assert exc.value.code == "INVALID_PIN"

    def test_no_lock_discards_value(self):
        assert validate_lock("NINGUNO", "1234") == ("NINGUNO", None)


# ------------------------------------------------------------------ work orders
class TestWorkOrdersV5:
    def _payload(self, factory, cliente=None, **overrides):
        brand, model = factory.brand_and_model()
        payload = {
            "cliente": cliente
            or {"identificacion": valid_cedula(900 + factory._next()), "nombre": "Ana", "apellido": "Mora", "celular": "0991234567"},
            "marca_id": brand.id,
            "modelo_id": model.id,
            "color": "Azul",
            "motivo_ingreso": "CAMBIO_DISPLAY",
            "tipo_display": "OLED",
            "tipo_garantia": "GARANTIA_LOCAL",
            "bloqueo_tipo": "PATRON",
            "bloqueo_valor": "1-5-9-6",
            "observacion": "Pantalla rota",
            "presupuesto": "80.00",
            "anticipo": "20.00",
        }
        payload.update(overrides)
        return payload

    def test_creates_order_and_registers_new_client(self, client, admin_headers, factory, uow):
        payload = self._payload(factory)
        response = client.post(f"{API}/work-orders", json=payload, headers=admin_headers)
        assert response.status_code == 201, response.text
        order = response.json()
        assert order["cliente"]["identificacion"] == payload["cliente"]["identificacion"]
        assert order["cliente"]["celular"] == "0991234567"
        assert (order["motivo_ingreso"], order["tipo_display"], order["motivo_ingreso_label"]) == (
            "CAMBIO_DISPLAY",
            "OLED",
            "Cambio de display",
        )
        assert order["tipo_garantia"] == "GARANTIA_LOCAL"
        assert (order["bloqueo_tipo"], order["bloqueo_valor"]) == ("PATRON", "1-5-9-6")
        assert order["saldo"] == "60.00"
        assert order["user"]["id"] and len(order["codigo_publico"]) == 24
        uow.rollback()  # fresh snapshot
        new_client = uow.users.get_by_identificacion(payload["cliente"]["identificacion"])
        assert new_client.is_client and new_client.email is None and new_client.password is None

    def test_existing_client_is_reused(self, client, admin_headers, factory):
        existing = factory.user(SystemRole.CLIENTE)
        cliente = {"identificacion": existing.identificacion, "nombre": "Otro", "apellido": "Nombre"}
        order = client.post(f"{API}/work-orders", json=self._payload(factory, cliente=cliente), headers=admin_headers).json()
        assert order["cliente_id"] == existing.id
        assert order["cliente"]["nombre"] == existing.nombre  # names of an existing client are kept

    def test_display_type_required_for_display_change(self, client, admin_headers, factory):
        response = client.post(
            f"{API}/work-orders", json=self._payload(factory, tipo_display=None), headers=admin_headers
        )
        assert response.status_code == 400
        assert response.json()["error"]["code"] == "DISPLAY_TYPE_REQUIRED"
        other = client.post(
            f"{API}/work-orders", json=self._payload(factory, motivo_ingreso="BATERIA"), headers=admin_headers
        ).json()
        assert other["tipo_display"] is None  # ignored for other reasons

    def test_invalid_pin(self, client, admin_headers, factory):
        response = client.post(
            f"{API}/work-orders",
            json=self._payload(factory, bloqueo_tipo="PIN", bloqueo_valor="12"),
            headers=admin_headers,
        )
        assert response.json()["error"]["code"] == "INVALID_PIN"

    def test_catalogs(self, client, admin_headers):
        catalogs = client.get(f"{API}/work-orders/catalogs", headers=admin_headers).json()
        assert len(catalogs["motivos_ingreso"]) == 13
        assert [o["value"] for o in catalogs["tipos_display"]] == ["INCELL", "OLED", "ORIGINAL"]
        assert {o["value"] for o in catalogs["tipos_bloqueo"]} == {"NINGUNO", "PATRON", "PIN"}
        assert catalogs["tipos_garantia"] and catalogs["estados"]

    def test_customer_lookup(self, client, factory):
        tech = factory.user(SystemRole.TECNICO)
        headers = auth_headers(client, tech.email)
        existing = factory.user(SystemRole.CLIENTE)
        found = client.get(
            f"{API}/work-orders/customers/lookup", params={"identificacion": existing.identificacion}, headers=headers
        )
        assert found.status_code == 200 and found.json()["id"] == existing.id
        missing = client.get(
            f"{API}/work-orders/customers/lookup", params={"identificacion": valid_cedula(4321)}, headers=headers
        )
        assert missing.status_code == 404

    def test_photos_up_to_three(self, client, admin_headers, factory, settings):
        order = client.post(f"{API}/work-orders", json=self._payload(factory), headers=admin_headers).json()
        url = f"{API}/work-orders/{order['id']}/photos"
        photos = [client.post(url, files=_png(), headers=admin_headers) for _ in range(3)]
        assert all(p.status_code == 201 for p in photos), photos[0].text
        assert photos[0].json()["url"].startswith("/media/work_orders/")
        fourth = client.post(url, files=_png(), headers=admin_headers)
        assert fourth.json()["error"]["code"] == "TOO_MANY_PHOTOS"

        detail = client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()
        assert len(detail["photos"]) == 3
        first = photos[0].json()
        assert client.delete(f"{url}/{first['id']}", headers=admin_headers).status_code == 204
        detail = client.get(f"{API}/work-orders/{order['id']}", headers=admin_headers).json()
        assert [p["id"] for p in detail["photos"]] == [p.json()["id"] for p in photos[1:]]

    def test_public_status_page(self, client, admin_headers, factory):
        order = client.post(f"{API}/work-orders", json=self._payload(factory), headers=admin_headers).json()
        public = client.get(f"{API}/public/work-orders/{order['codigo_publico']}")  # no token
        assert public.status_code == 200
        body = public.json()
        assert body["num_orden"] == order["num_orden"] and body["estado_label"]
        assert "bloqueo_valor" not in body and "cliente" not in body and "codigo_publico" not in body
        assert client.get(f"{API}/public/work-orders/noexiste").status_code == 404

    def test_list_filters_by_client_cedula(self, client, admin_headers, factory):
        payload = self._payload(factory)
        client.post(f"{API}/work-orders", json=payload, headers=admin_headers)
        listed = client.get(
            f"{API}/work-orders", params={"cliente": payload["cliente"]["identificacion"]}, headers=admin_headers
        ).json()
        assert listed["total"] == 1


# ------------------------------------------------------------------ clients without email
def test_client_email_is_optional(client, admin_headers):
    response = client.post(
        f"{API}/clients",
        json={"nombre": "Sin", "apellido": "Email", "email": "", "identificacion": valid_cedula(777)},
        headers=admin_headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] is None


def test_seller_still_needs_email(client, admin_headers, uow):
    response = client.post(
        f"{API}/users",
        json={
            "nombre": "V",
            "apellido": "V",
            "rol_id": uow.roles.get_by_nombre("VENDEDOR").id,
            "identificacion": valid_cedula(778),
            "branch_ids": [1],
        },
        headers=admin_headers,
    )
    assert response.status_code == 400
    assert response.json()["error"]["details"]["field"] == "email"


# ------------------------------------------------------------------ sales
def _sale(client, headers, inv, **extra):
    body = {"branch_id": inv.branch_id, "items": [{"inventory_id": inv.id, "cantidad": 1}], "metodo_pago": "EFECTIVO", **extra}
    response = client.post(f"{API}/sales", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


class TestSalesV5:
    def test_filters_use_the_local_day(self, client, admin_headers, factory, uow):
        sale = _sale(client, admin_headers, factory.inventory())
        # 2026-09-02 03:00 UTC = 2026-09-01 22:00 in Guayaquil (UTC-5)
        with uow.transaction():
            uow.session.execute(
                update(sales_table).where(sales_table.c.id == sale["id"]).values(fecha=datetime(2026, 9, 2, 3, 0))
            )

        def ids(day):
            params = {"fecha_desde": day, "fecha_hasta": day, "size": 100}
            return [s["id"] for s in client.get(f"{API}/sales", params=params, headers=admin_headers).json()["items"]]

        assert sale["id"] in ids("2026-09-01")
        assert sale["id"] not in ids("2026-09-02")

    def test_filter_by_client_cedula(self, client, admin_headers, factory):
        customer = factory.user(SystemRole.CLIENTE)
        with_client = _sale(client, admin_headers, factory.inventory(), cliente_id=customer.id)
        _sale(client, admin_headers, factory.inventory())
        items = client.get(
            f"{API}/sales", params={"identificacion": customer.identificacion}, headers=admin_headers
        ).json()["items"]
        assert [s["id"] for s in items] == [with_client["id"]]

    def test_today_summary_of_the_seller(self, client, factory):
        seller = factory.user(SystemRole.VENDEDOR)
        headers = auth_headers(client, seller.email)
        empty = client.get(f"{API}/sales/summary/today", headers=headers).json()
        assert (empty["cantidad"], empty["total"]) == (0, "0.00")

        _sale(client, headers, factory.inventory(precio="10.00"))
        _sale(client, headers, factory.inventory(precio="5.50"), metodo_pago="TARJETA")  # + 6 %
        cancelled = _sale(client, headers, factory.inventory(precio="99.00"))
        admin = auth_headers(client, factory.user(SystemRole.ADMIN).email)
        assert client.post(f"{API}/sales/{cancelled['id']}/cancel", headers=admin).status_code == 200

        summary = client.get(f"{API}/sales/summary/today", headers=headers).json()
        assert summary["cantidad"] == 2
        assert summary["total"] == "15.83"  # 10.00 + 5.83
