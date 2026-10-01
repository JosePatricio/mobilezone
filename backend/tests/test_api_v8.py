"""Work orders v8: Recibido / En proceso / Finalizado. En proceso records the approximate
delivery time and a note; Finalizado closes the order and registers the sale of the repair."""
from __future__ import annotations

from datetime import datetime
from decimal import Decimal

import pytest

from app.domain.entities import Sale
from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import PaymentMethod, SystemRole
from tests.conftest import auth_headers

API = "/api/v1"


def _order(client, headers, factory, presupuesto="100.00", anticipo="30.00"):
    customer = factory.user(SystemRole.CLIENTE)
    brand, model = factory.brand_and_model()
    body = {
        "cliente": {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "motivo_ingreso": "BATERIA",
        "presupuesto": presupuesto,
        "anticipo": anticipo,
    }
    response = client.post(f"{API}/work-orders", json=body, headers=headers)
    assert response.status_code == 201, response.text
    return response.json(), body


# ------------------------------------------------------------------ domain: payment of a repair
class TestRepairPayment:
    def _sale(self):
        return Sale.for_work_order(user_id=1, branch_id=1, cliente_id=2, work_order_id=3, total=Decimal("100"))

    def test_card_surcharge_applies_to_the_saldo(self):
        sale = self._sale()
        sale.apply_payment(PaymentMethod.TARJETA, pagado_previo=Decimal("30"))
        assert (sale.total, sale.recargo, sale.total_pagar) == (Decimal("100.00"), Decimal("4.20"), Decimal("104.20"))

    def test_cash_change_is_computed_on_the_saldo(self):
        sale = self._sale()
        sale.apply_payment(PaymentMethod.EFECTIVO, Decimal("80"), pagado_previo=Decimal("30"))
        assert sale.cambio == Decimal("10.00")
        with pytest.raises(ValidationError):
            self._sale().apply_payment(PaymentMethod.EFECTIVO, Decimal("60"), pagado_previo=Decimal("30"))


def test_new_order_starts_received_with_history(client, admin_headers, factory):
    order, _ = _order(client, admin_headers, factory)
    assert order["estado"] == 0 and order["estado_label"] == "Recibido"
    assert [c["estado"] for c in order["status_changes"]] == [0]
    assert order["sale"] is None


def test_estado_cannot_be_sent_when_creating(client, admin_headers, factory):
    _, body = _order(client, admin_headers, factory)
    response = client.post(f"{API}/work-orders", json={**body, "estado": 2}, headers=admin_headers)
    assert response.status_code == 422


def test_in_process_requires_the_delivery_time_and_keeps_the_note(client, admin_headers, factory):
    order, _ = _order(client, admin_headers, factory)
    url = f"{API}/work-orders/{order['id']}/status"
    missing = client.patch(url, json={"estado": 1}, headers=admin_headers)
    assert missing.status_code == 400 and missing.json()["error"]["details"]["field"] == "fecha_entrega"

    updated = client.patch(
        url,
        json={"estado": 1, "fecha_entrega": "2026-10-03T15:30", "observacion": "Esperando pantalla"},
        headers=admin_headers,
    ).json()
    assert updated["estado_label"] == "En proceso"
    entrega = datetime.fromisoformat(updated["fecha_entrega"].replace("Z", "+00:00"))
    assert entrega.utcoffset() is not None and entrega.hour == 20  # 15:30 in Guayaquil = 20:30 UTC
    last = updated["status_changes"][-1]
    assert last["estado"] == 1 and last["observacion"] == "Esperando pantalla" and last["fecha_entrega"]

    back = client.patch(url, json={"estado": 0}, headers=admin_headers).json()
    assert back["estado"] == 0 and len(back["status_changes"]) == 3


def test_finalize_registers_a_sale_and_locks_the_order(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    order, body = _order(client, headers, factory)
    url = f"{API}/work-orders/{order['id']}"

    # Finalizado is not a plain status change.
    plain = client.patch(f"{url}/status", json={"estado": 2}, headers=headers)
    assert plain.json()["error"]["code"] == "FINALIZE_REQUIRED"

    finalized = client.post(
        f"{url}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "EFECTIVO", "monto_recibido": "100.00"},
        headers=headers,
    )
    assert finalized.status_code == 200, finalized.text
    data = finalized.json()
    assert data["estado_label"] == "Finalizado"
    assert data["sale"]["total"] == "100.00" and data["sale"]["total_pagar"] == "100.00"

    # The sale is in the sales module (list, detail, today's summary of the seller, receipt).
    sale = client.get(f"{API}/sales/{data['sale']['id']}", headers=headers).json()
    assert sale["work_order"]["num_orden"] == order["num_orden"]
    assert sale["cliente_id"] == order["cliente_id"] and sale["details"] == []
    assert sale["cambio"] == "30.00"  # saldo 70 paid with 100
    listed = client.get(f"{API}/sales", headers=headers).json()["items"]
    assert data["sale"]["id"] in [s["id"] for s in listed]
    summary = client.get(f"{API}/sales/summary/today", headers=headers).json()
    assert summary["cantidad"] == 1 and summary["total"] == "100.00"
    receipt = client.get(f"{API}/sales/{data['sale']['id']}/receipt", headers=headers)
    assert receipt.status_code == 200 and receipt.content.startswith(b"%PDF")

    # Nothing can be changed anymore.
    assert client.put(url, json=body, headers=headers).json()["error"]["code"] == "WORK_ORDER_FINALIZED"
    reopened = client.patch(f"{url}/status", json={"estado": 0}, headers=headers)
    assert reopened.json()["error"]["code"] == "WORK_ORDER_FINALIZED"
    again = client.post(
        f"{url}/finalize", json={"branch_id": factory.default_branch.id, "metodo_pago": "EFECTIVO"}, headers=headers
    )
    assert again.json()["error"]["code"] == "WORK_ORDER_FINALIZED"
    part = factory.spare_part()
    added = client.post(f"{url}/spare-parts", json={"spare_part_id": part.id}, headers=headers)
    assert added.json()["error"]["code"] == "WORK_ORDER_FINALIZED"

    # The sale of a repair cannot be modified nor cancelled from sales.
    admin = auth_headers(client, factory.user(SystemRole.ADMIN).email)
    cancel = client.post(f"{API}/sales/{data['sale']['id']}/cancel", headers=admin)
    assert cancel.json()["error"]["code"] == "SALE_FROM_WORK_ORDER"


def test_finalize_requires_an_assigned_branch(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    order, _ = _order(client, headers, factory)
    other = factory.branch()
    response = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json={"branch_id": other.id, "metodo_pago": "TRANSFERENCIA"},
        headers=headers,
    )
    assert response.status_code == 403
    assert client.get(f"{API}/work-orders/{order['id']}", headers=headers).json()["estado"] == 0  # rolled back


def test_card_payment_adds_the_surcharge_on_the_saldo(client, admin_headers, factory):
    order, _ = _order(client, admin_headers, factory, presupuesto="50.00", anticipo="0.00")
    data = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json={"branch_id": factory.default_branch.id, "metodo_pago": "TARJETA"},
        headers=admin_headers,
    ).json()
    assert data["sale"]["total_pagar"] == "53.00"
