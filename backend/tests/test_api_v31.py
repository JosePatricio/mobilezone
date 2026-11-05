"""A phone number (celular) belongs to one cédula / RUC only: users, clients and work orders
reject a phone already registered, and the forms check it while typing."""
from __future__ import annotations

from app.domain.entities.user import celular_variants
from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers, valid_cedula

API = "/api/v1"


def test_celular_variants_match_local_and_international_forms():
    expected = ["+593991234567", "0991234567", "593991234567"]
    assert celular_variants("0991234567") == expected
    assert celular_variants("+593991234567") == expected
    assert celular_variants("593991234567") == expected
    assert celular_variants("2345678") == ["+2345678", "2345678"]


def _client_body(cedula: str, celular: str | None) -> dict:
    return {"nombre": "Ana", "apellido": "Mora", "identificacion": cedula, "celular": celular, "estado": True}


def _client_with_phone(client, headers, n: int, celular: str) -> dict:
    response = client.post(f"{API}/clients", json=_client_body(valid_cedula(n), celular), headers=headers)
    assert response.status_code == 201, response.text
    return response.json()


def test_client_cannot_repeat_a_phone_of_another_cedula(client, admin_headers):
    ana = _client_with_phone(client, admin_headers, 3101, "0991230001")

    for celular in ("0991230001", "+593 99 123 0001"):
        response = client.post(f"{API}/clients", json=_client_body(valid_cedula(3102), celular), headers=admin_headers)
        assert response.status_code == 409, response.text
        error = response.json()["error"]
        assert error["code"] == "PHONE_ALREADY_EXISTS"
        assert error["details"]["field"] == "celular"
        assert "ya existe" in error["message"]

    # The same client keeps its phone when it is updated.
    updated = client.put(
        f"{API}/clients/{ana['id']}", json=_client_body(ana["identificacion"], "0991230001"), headers=admin_headers
    )
    assert updated.status_code == 200, updated.text


def test_user_update_cannot_take_the_phone_of_another_user(client, admin_headers):
    _client_with_phone(client, admin_headers, 3111, "0991230011")
    other = _client_with_phone(client, admin_headers, 3112, "0991230012")
    rol_id = client.get(f"{API}/users/{other['id']}", headers=admin_headers).json()["rol_id"]
    response = client.put(
        f"{API}/users/{other['id']}",
        json={**_client_body(other["identificacion"], "0991230011"), "rol_id": rol_id, "branch_ids": []},
        headers=admin_headers,
    )
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "PHONE_ALREADY_EXISTS"


def test_sale_customer_cannot_repeat_a_phone(client, admin_headers):
    _client_with_phone(client, admin_headers, 3121, "0991230021")
    response = client.post(
        f"{API}/sales/customers", json=_client_body(valid_cedula(3122), "0991230021"), headers=admin_headers
    )
    assert response.status_code == 409, response.text


def test_work_order_new_client_cannot_repeat_a_phone(client, admin_headers, factory):
    _client_with_phone(client, admin_headers, 3131, "0991230031")
    brand, model = factory.brand_and_model()
    body = {
        "cliente": {"identificacion": valid_cedula(3132), "nombre": "Luis", "apellido": "Vera", "celular": "0991230031"},
        "marca_id": brand.id,
        "modelo_id": model.id,
        "motivo_ingreso": ["CAMBIO_DISPLAY"],
        "presupuesto": "50.00",
        "anticipo": "0.00",
    }
    response = client.post(f"{API}/work-orders", json=body, headers=admin_headers)
    assert response.status_code == 409, response.text
    assert response.json()["error"]["details"]["field"] == "cliente.celular"

    created = client.post(
        f"{API}/work-orders/customers", json=_client_body(valid_cedula(3133), "0991230031"), headers=admin_headers
    )
    assert created.status_code == 409, created.text


def test_celular_check_endpoint(client, admin_headers, factory):
    ana = _client_with_phone(client, admin_headers, 3141, "0991230041")
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)  # any logged user (sales / work order forms)

    taken = client.get(f"{API}/users/celular-check", params={"celular": "099 123 0041"}, headers=headers)
    assert taken.status_code == 200, taken.text
    assert taken.json()["existe"] is True
    assert "ya existe" in taken.json()["message"]

    own = client.get(
        f"{API}/users/celular-check", params={"celular": "0991230041", "exclude_id": ana["id"]}, headers=headers
    )
    assert own.json() == {"existe": False, "message": None}
    free = client.get(f"{API}/users/celular-check", params={"celular": "0991230049"}, headers=headers)
    assert free.json()["existe"] is False
    invalid = client.get(f"{API}/users/celular-check", params={"celular": "abc"}, headers=headers)
    assert invalid.json()["existe"] is False


def test_phone_saved_in_an_old_format_is_also_detected(client, admin_headers, factory, uow):
    """Phones saved before the normalization may keep spaces or dashes."""
    legacy = factory.user(SystemRole.CLIENTE)
    with uow.transaction():
        uow.users.get(legacy.id).celular = "099-123 0051"
    response = client.post(f"{API}/clients", json=_client_body(valid_cedula(3152), "0991230051"), headers=admin_headers)
    assert response.status_code == 409, response.text
    assert response.json()["error"]["code"] == "PHONE_ALREADY_EXISTS"


def test_warranty_is_chosen_when_finalizing(client, admin_headers, factory):
    from tests.test_api_v21 import _finalize_body, _order_body

    order = client.post(f"{API}/work-orders", json=_order_body(factory), headers=admin_headers).json()
    assert order["garantia_dias"] == 0
    response = client.post(
        f"{API}/work-orders/{order['id']}/finalize",
        json={**_finalize_body(factory), "garantia_dias": 90},
        headers=admin_headers,
    )
    assert response.status_code == 200, response.text
    assert response.json()["garantia_dias"] == 90


def test_finalize_without_warranty_keeps_the_order_value(client, admin_headers, factory):
    from tests.test_api_v21 import _finalize_body, _order_body

    order = client.post(f"{API}/work-orders", json={**_order_body(factory), "garantia_dias": 30}, headers=admin_headers).json()
    done = client.post(f"{API}/work-orders/{order['id']}/finalize", json=_finalize_body(factory), headers=admin_headers)
    assert done.status_code == 200, done.text
    assert done.json()["garantia_dias"] == 30
    invalid = client.post(
        f"{API}/work-orders/{order['id']}/finalize", json={**_finalize_body(factory), "garantia_dias": -1}, headers=admin_headers
    )
    assert invalid.status_code == 422
