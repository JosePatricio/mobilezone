"""Propaganda through the WhatsApp Cloud API: campaigns sent in the background, webhooks and opt-outs
(MySQL; Meta replaced by the fake gateway of test_whatsapp)."""
from __future__ import annotations

import json

import pytest

from app.domain.value_objects.enums import SystemRole
from tests.conftest import auth_headers
from tests.test_api_v23 import _order
from tests.test_whatsapp import PROMO, WITH_IMAGE, FakeGateway

API = "/api/v1"
CAMPAIGNS = f"{API}/marketing/whatsapp/campaigns"


@pytest.fixture
def gateway(app):
    fake = FakeGateway([PROMO, WITH_IMAGE], fail_for={"593980000000"})
    app.state.whatsapp_gateway = fake
    app.state.settings = app.state.settings.model_copy(update={"whatsapp_verify_token": "VERIFY"})
    return fake


def _customer(client, headers, factory, celular):
    customer, _, _ = _order(client, headers, factory)
    with factory.uow.transaction():
        factory.uow.users.get(customer.id).celular = celular
    return customer


def _campaign(client, headers, ids, plantilla="promo", parametros=None, files=None):
    data = {
        "plantilla": plantilla,
        "idioma": "es",
        "cliente_ids": ids,
        "parametros": parametros if parametros is not None else [{"source": "NOMBRE"}, {"source": "TEXTO", "texto": "Promo"}],
    }
    return client.post(CAMPAIGNS, data={"data": json.dumps(data)}, files=files, headers=headers)


def test_campaign_is_sent_in_the_background_and_tracked(client, admin_headers, factory, gateway):
    ana = _customer(client, admin_headers, factory, "0991234567")
    failing = _customer(client, admin_headers, factory, "0980000000")
    without_phone = _customer(client, admin_headers, factory, None)

    response = _campaign(client, admin_headers, [ana.id, failing.id, without_phone.id])
    assert response.status_code == 202, response.text
    assert response.json() == {"campaign_id": response.json()["campaign_id"], "encolados": 2, "sin_numero": 1, "dados_de_baja": 0}
    assert [(m.to, m.body_values) for m in gateway.sent] == [("593991234567", [("1", ana.nombre), ("2", "Promo")])]

    campaigns = client.get(CAMPAIGNS, headers=admin_headers).json()
    assert [(c["plantilla"], c["total"], c["enviados"], c["fallidos"], c["pendientes"]) for c in campaigns] == [
        ("promo", 2, 1, 1, 0)
    ]
    detail = client.get(f"{CAMPAIGNS}/{campaigns[0]['id']}", headers=admin_headers).json()
    assert [(m["cliente_id"], m["estado"]) for m in detail["messages"]] == [(ana.id, "ENVIADO"), (failing.id, "FALLIDO")]
    assert "allowed list" in detail["messages"][1]["error"]


def test_webhook_states_only_move_forward_and_replies_opt_out(client, admin_headers, factory, gateway):
    ana = _customer(client, admin_headers, factory, "0991234567")
    campaign_id = _campaign(client, admin_headers, [ana.id]).json()["campaign_id"]

    def notify(value):
        body = {"entry": [{"changes": [{"field": "messages", "value": value}]}]}
        response = client.post(f"{API}/whatsapp/webhook", json=body, headers={"X-Hub-Signature-256": "sha256=x"})
        assert response.status_code == 200, response.text

    notify({"statuses": [{"id": "wamid.1", "status": "read"}]})
    notify({"statuses": [{"id": "wamid.1", "status": "delivered"}]})  # late: must not go back
    detail = client.get(f"{CAMPAIGNS}/{campaign_id}", headers=admin_headers).json()
    assert detail["messages"][0]["estado"] == "LEIDO"

    notify({"messages": [{"from": "593991234567", "type": "text", "text": {"body": "BAJA"}}]})
    response = _campaign(client, admin_headers, [ana.id])
    assert response.status_code == 400
    assert response.json()["error"]["code"] == "NO_RECIPIENTS"


def test_webhook_rejects_bad_signature_and_verifies_the_url(client, gateway):
    gateway.valid_signature = lambda body, signature: False
    assert client.post(f"{API}/whatsapp/webhook", json={"entry": []}).status_code == 401

    params = {"hub.mode": "subscribe", "hub.verify_token": "VERIFY", "hub.challenge": "12345"}
    response = client.get(f"{API}/whatsapp/webhook", params=params)
    assert (response.status_code, response.text) == (200, "12345")
    assert client.get(f"{API}/whatsapp/webhook", params={**params, "hub.verify_token": "bad"}).status_code == 401


def test_header_image_is_uploaded_with_the_campaign(client, admin_headers, factory, gateway):
    ana = _customer(client, admin_headers, factory, "0991234567")
    files = {"file": ("promo.png", b"\x89PNG", "image/png")}
    response = _campaign(client, admin_headers, [ana.id], plantilla="promo_img", parametros=[], files=files)
    assert response.status_code == 202, response.text
    assert gateway.uploads == ["image/png"]
    assert gateway.sent[0].header_media == ("IMAGE", "MEDIA1")


def test_campaigns_need_whatsapp_configured_and_the_marketing_permission(client, admin_headers, factory, app):
    app.state.whatsapp_gateway = None
    response = client.get(f"{API}/marketing/whatsapp/templates", headers=admin_headers)
    assert (response.status_code, response.json()["error"]["code"]) == (409, "WHATSAPP_NOT_CONFIGURED")

    seller = factory.user(SystemRole.VENDEDOR)
    assert client.get(CAMPAIGNS, headers=auth_headers(client, seller.email)).status_code == 403
