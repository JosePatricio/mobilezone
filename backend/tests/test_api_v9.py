"""Default administrator always present (the "vaciar datos" option was removed in upgrade 015)."""
from __future__ import annotations

from tests.conftest import auth_headers

API = "/api/v1"


def test_default_administrator_is_seeded(client):
    headers = auth_headers(client, "josedavidip89@gmail.com", "sinclav3")
    me = client.get(f"{API}/auth/me", headers=headers)
    assert me.status_code == 200 and me.json()["user"]["role"]["nombre"] == "ADMIN"


def test_reset_data_no_longer_exists(client, admin_headers):
    response = client.post(f"{API}/settings/reset-data", json={"confirmacion": "VACIAR"}, headers=admin_headers)
    assert response.status_code in (404, 405)
