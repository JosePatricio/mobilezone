"""Mi perfil: the logged user changes their own password."""
from __future__ import annotations

from app.domain.value_objects.enums import SystemRole
from tests.conftest import PASSWORD, auth_headers

API = "/api/v1"
URL = f"{API}/auth/change-password"


def _login(client, email, password):
    return client.post(f"{API}/auth/login", json={"email": email, "password": password})


def test_user_changes_their_password(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)

    response = client.post(URL, json={"current_password": PASSWORD, "new_password": "NuevaClave99"}, headers=headers)
    assert response.status_code == 204, response.text

    assert _login(client, seller.email, PASSWORD).status_code == 401
    assert _login(client, seller.email, "NuevaClave99").status_code == 200


def test_wrong_current_password_is_rejected_without_ending_the_session(client, factory):
    tech = factory.user(SystemRole.TECNICO)
    headers = auth_headers(client, tech.email)

    response = client.post(URL, json={"current_password": "otra-cosa", "new_password": "NuevaClave99"}, headers=headers)
    assert response.status_code == 400
    error = response.json()["error"]
    assert error["code"] == "INVALID_CURRENT_PASSWORD" and error["details"] == {"field": "current_password"}
    assert _login(client, tech.email, PASSWORD).status_code == 200


def test_new_password_rules(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)
    headers = auth_headers(client, seller.email)

    short = client.post(URL, json={"current_password": PASSWORD, "new_password": "corta"}, headers=headers)
    assert short.status_code == 400
    assert short.json()["error"]["code"] == "WEAK_PASSWORD"
    assert short.json()["error"]["details"] == {"field": "new_password"}

    same = client.post(URL, json={"current_password": PASSWORD, "new_password": PASSWORD}, headers=headers)
    assert same.status_code == 400 and same.json()["error"]["code"] == "SAME_PASSWORD"


def test_change_password_requires_login(client):
    response = client.post(URL, json={"current_password": PASSWORD, "new_password": "NuevaClave99"})
    assert response.status_code == 401


def _expires_in_hours(response) -> float:
    from datetime import datetime, timezone

    expires_at = datetime.fromisoformat(response.json()["expires_at"].replace("Z", "+00:00"))
    return (expires_at - datetime.now(timezone.utc)).total_seconds() / 3600


def test_keep_session_issues_a_longer_token(client, factory, settings):
    seller = factory.user(SystemRole.VENDEDOR)
    normal = client.post(f"{API}/auth/login", json={"email": seller.email, "password": PASSWORD})
    kept = client.post(f"{API}/auth/login", json={"email": seller.email, "password": PASSWORD, "remember": True})
    assert normal.status_code == 200 and kept.status_code == 200
    assert _expires_in_hours(normal) <= settings.access_token_expire_minutes / 60
    assert _expires_in_hours(kept) > 24 * (settings.remember_token_expire_days - 1)
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {kept.json()['access_token']}"})
    assert me.status_code == 200


def test_default_password_is_reported_until_it_is_changed(client, admin_headers, uow):
    from tests.conftest import valid_cedula
    from tests.test_api_v2 import _role_id

    cedula = valid_cedula(777)
    body = {"nombre": "Tito", "apellido": "T", "email": "tito@example.com", "rol_id": _role_id(uow, "TECNICO"), "identificacion": cedula}
    assert client.post(f"{API}/users", json=body, headers=admin_headers).status_code == 201

    login = _login(client, "tito@example.com", cedula)
    assert login.json()["password_por_defecto"] is True
    headers = {"Authorization": f"Bearer {login.json()['access_token']}"}
    assert client.get(f"{API}/auth/me", headers=headers).json()["password_por_defecto"] is True

    changed = client.post(URL, json={"current_password": cedula, "new_password": "NuevaClave99"}, headers=headers)
    assert changed.status_code == 204
    assert client.get(f"{API}/auth/me", headers=headers).json()["password_por_defecto"] is False
    assert _login(client, "tito@example.com", "NuevaClave99").json()["password_por_defecto"] is False


def test_users_with_their_own_password_get_no_warning(client, factory):
    seller = factory.user(SystemRole.VENDEDOR)  # no cédula, own password
    login = _login(client, seller.email, PASSWORD)
    assert login.json()["password_por_defecto"] is False
    me = client.get(f"{API}/auth/me", headers={"Authorization": f"Bearer {login.json()['access_token']}"})
    assert me.json()["password_por_defecto"] is False


def test_email_is_optional_for_every_role(client, admin_headers, uow):
    from tests.test_api_v2 import _role_id

    body = {"nombre": "Sin", "apellido": "Correo", "email": "", "rol_id": _role_id(uow, "TECNICO"), "identificacion": "11"}
    created = client.post(f"{API}/users", json=body, headers=admin_headers)
    assert created.status_code == 201, created.text
    assert created.json()["email"] is None
    updated = client.put(f"{API}/users/{created.json()['id']}", json={**body, "email": None}, headers=admin_headers)
    assert updated.status_code == 200, updated.text
    assert updated.json()["email"] is None
