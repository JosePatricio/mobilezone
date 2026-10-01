"""Work orders v6: the seller works with orders, brands and models; the logged user is the
technician; the date is today; warranty time in days; delivery date and time; new customer modal."""
from __future__ import annotations

from datetime import datetime
from zoneinfo import ZoneInfo

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers, valid_cedula

API = "/api/v1"


def iso(value: str) -> datetime:
    return datetime.fromisoformat(value.replace("Z", "+00:00"))  # Python 3.10 does not read "Z"


TZ = ZoneInfo("America/Guayaquil")


def _payload(factory, **overrides):
    customer = factory.user(SystemRole.CLIENTE)
    brand, model = factory.brand_and_model()
    payload = {
        "cliente": {"identificacion": customer.identificacion, "nombre": customer.nombre, "apellido": customer.apellido},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "color": "Negro",
        "motivo_ingreso": "BATERIA",
        "garantia_dias": 30,
        "presupuesto": "40.00",
        "anticipo": "10.00",
    }
    payload.update(overrides)
    return payload


def test_seller_creates_an_order_and_is_its_technician(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    response = client.post(f"{API}/work-orders", json=_payload(factory), headers=headers)
    assert response.status_code == 201, response.text
    order = response.json()
    assert order["tecnico"]["id"] == seller.id and order["user"]["id"] == seller.id
    assert order["fecha"] == datetime.now(TZ).date().isoformat()
    assert order["garantia_dias"] == 30


def test_technician_and_date_cannot_be_sent(client, admin_headers, factory):
    for extra in ({"tecnico_id": 1}, {"fecha": "2020-01-01"}, {"tipo_garantia": "SIN_GARANTIA"}):
        response = client.post(f"{API}/work-orders", json=_payload(factory, **extra), headers=admin_headers)
        assert response.status_code == 422, extra


def test_warranty_days_range(client, admin_headers, factory):
    response = client.post(f"{API}/work-orders", json=_payload(factory, garantia_dias=-1), headers=admin_headers)
    assert response.status_code == 422


def test_delivery_date_keeps_the_local_time(client, admin_headers, factory):
    # Without offset = local time of the shop (Guayaquil, UTC-5).
    order = client.post(
        f"{API}/work-orders", json=_payload(factory, fecha_entrega="2026-10-05T16:30"), headers=admin_headers
    ).json()
    entrega = iso(order["fecha_entrega"])
    assert entrega.utcoffset() is not None
    assert entrega.astimezone(TZ).replace(tzinfo=None) == datetime(2026, 10, 5, 16, 30)

    with_offset = client.post(
        f"{API}/work-orders", json=_payload(factory, fecha_entrega="2026-10-05T21:30:00Z"), headers=admin_headers
    ).json()
    assert iso(with_offset["fecha_entrega"]) == entrega

    public = client.get(f"{API}/public/work-orders/{order['codigo_publico']}").json()
    assert public["fecha_entrega"] and public["garantia_dias"] == 30


def test_datetimes_are_returned_with_time_zone(client, admin_headers, factory):
    order = client.post(f"{API}/work-orders", json=_payload(factory), headers=admin_headers).json()
    assert iso(order["created_at"]).utcoffset() is not None


def test_seller_registers_a_customer_from_the_order_screen(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    response = client.post(
        f"{API}/work-orders/customers",
        json={"nombre": "Luis", "apellido": "Vera", "identificacion": valid_cedula(4455), "celular": "0987654321"},
        headers=headers,
    )
    assert response.status_code == 201, response.text
    assert response.json()["email"] is None
    found = client.get(
        f"{API}/work-orders/customers/lookup", params={"identificacion": valid_cedula(4455)}, headers=headers
    )
    assert found.json()["nombre"] == "Luis"


def test_seller_manages_brands_and_models(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)
    brand = client.post(f"{API}/brands", json={"nombre": "Xiaomi"}, headers=headers)
    assert brand.status_code == 201, brand.text
    model = client.post(f"{API}/models", json={"nombre": "Redmi 12", "brand_id": brand.json()["id"]}, headers=headers)
    assert model.status_code == 201, model.text
