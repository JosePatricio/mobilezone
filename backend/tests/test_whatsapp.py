"""WhatsApp Cloud API (Propaganda): pure tests, no database (fake Unit of Work and fake Meta)."""
from __future__ import annotations

import hashlib
import hmac
import json
from contextlib import contextmanager
from datetime import date

import httpx
import pytest

from app.application.services.whatsapp import OutgoingTemplate, WhatsAppError, WhatsAppGateway, WhatsAppTemplate
from app.application.use_cases.whatsapp import (
    CreateWhatsAppCampaignUseCase,
    HandleWhatsAppWebhookUseCase,
    ListWhatsAppTemplatesQuery,
    MediaFile,
    ParamSource,
    SendWhatsAppCampaignUseCase,
    TemplateParam,
)
from app.domain.entities import User
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.repositories import OrderClient, PendingWhatsAppMessage
from app.domain.value_objects.whatsapp import WhatsAppMessageStatus, normalize_keyword, whatsapp_number
from app.infrastructure.whatsapp.cloud_api import CloudApiWhatsAppGateway, parse_template, template_payload


# --- phone numbers and keywords ---------------------------------------------------------------

@pytest.mark.parametrize(
    "celular, expected",
    [
        ("0991234567", "593991234567"),
        ("099 123 4567", "593991234567"),
        ("+593991234567", "593991234567"),
        ("593991234567", "593991234567"),
        ("+1 415 555 0100", "14155550100"),
        ("096911155", None),  # Ecuadorian mobile with a digit missing
        ("2345678", None),  # local landline without area code: too short
        ("", None),
        (None, None),
    ],
)
def test_whatsapp_number(celular, expected):
    assert whatsapp_number(celular) == expected


def test_normalize_keyword():
    assert normalize_keyword("  ¡Baja! ") == "BAJA"
    assert normalize_keyword("Detener promociones") == "DETENER PROMOCIONES"
    assert normalize_keyword(None) == ""


# --- Meta Cloud API client --------------------------------------------------------------------

META_TEMPLATE = {
    "name": "promo_octubre",
    "language": "es",
    "status": "APPROVED",
    "category": "MARKETING",
    "components": [
        {"type": "HEADER", "format": "IMAGE"},
        {"type": "BODY", "text": "Hola {{1}}, oferta para tu {{2}}. {{1}}, no te la pierdas."},
        {"type": "FOOTER", "text": "Responde BAJA para no recibir más"},
        {"type": "BUTTONS", "buttons": [{"type": "QUICK_REPLY", "text": "Detener promociones"}]},
    ],
}


def test_parse_template():
    template = parse_template(META_TEMPLATE)
    assert (template.name, template.language, template.category, template.header_format) == (
        "promo_octubre", "es", "MARKETING", "IMAGE"
    )
    assert template.body_params == ["1", "2"]
    assert template.footer == "Responde BAJA para no recibir más"
    assert template.unsupported_params is False


def test_parse_template_with_dynamic_url_button_is_unsupported():
    data = {**META_TEMPLATE, "components": [{"type": "BUTTONS", "buttons": [{"type": "URL", "url": "https://x.com/{{1}}"}]}]}
    assert parse_template(data).unsupported_params is True


def test_template_payload_positional_and_named():
    positional = template_payload(
        OutgoingTemplate("593991234567", "promo", "es", [("1", "Ana")], header_media=("IMAGE", "MEDIA1"))
    )
    assert positional["to"] == "593991234567"
    assert positional["template"]["components"] == [
        {"type": "header", "parameters": [{"type": "image", "image": {"id": "MEDIA1"}}]},
        {"type": "body", "parameters": [{"type": "text", "text": "Ana"}]},
    ]
    named = template_payload(OutgoingTemplate("1", "promo", "es", [("nombre", "Ana")]))
    assert named["template"]["components"][0]["parameters"][0]["parameter_name"] == "nombre"
    assert "components" not in template_payload(OutgoingTemplate("1", "hello_world", "en_US", []))["template"]


def _gateway(handler) -> CloudApiWhatsAppGateway:
    return CloudApiWhatsAppGateway(
        access_token="TOKEN",
        phone_number_id="PHONE",
        business_account_id="WABA",
        app_secret="SECRET",
        api_version="v23.0",
        transport=httpx.MockTransport(handler),
    )


def test_gateway_sends_template_and_reads_message_id():
    def handler(request: httpx.Request) -> httpx.Response:
        assert request.url.path == "/v23.0/PHONE/messages"
        assert request.headers["Authorization"] == "Bearer TOKEN"
        assert json.loads(request.content)["template"]["name"] == "hello_world"
        return httpx.Response(200, json={"messages": [{"id": "wamid.1"}]})

    assert _gateway(handler).send_template(OutgoingTemplate("593991234567", "hello_world", "en_US", [])) == "wamid.1"


def test_gateway_error_carries_meta_message():
    def handler(request: httpx.Request) -> httpx.Response:
        error = {"message": "Recipient phone number not in allowed list", "code": 131030, "error_data": {"details": "Add it"}}
        return httpx.Response(400, json={"error": error})

    with pytest.raises(WhatsAppError) as info:
        _gateway(handler).send_template(OutgoingTemplate("593991234567", "hello_world", "en_US", []))
    assert info.value.message == "Recipient phone number not in allowed list (Add it)"
    assert info.value.details["meta_code"] == 131030


def test_gateway_reads_every_page_of_templates():
    def handler(request: httpx.Request) -> httpx.Response:
        if "after" in request.url.params:
            return httpx.Response(200, json={"data": [{**META_TEMPLATE, "name": "second"}]})
        nxt = "https://graph.facebook.com/v23.0/WABA/message_templates?after=abc"
        return httpx.Response(200, json={"data": [META_TEMPLATE], "paging": {"next": nxt}})

    assert [t.name for t in _gateway(handler).templates()] == ["promo_octubre", "second"]


def test_webhook_signature():
    gateway = _gateway(lambda r: httpx.Response(200))
    body = b'{"entry": []}'
    good = "sha256=" + hmac.new(b"SECRET", body, hashlib.sha256).hexdigest()
    assert gateway.valid_signature(body, good)
    assert not gateway.valid_signature(body + b" ", good)
    assert not gateway.valid_signature(body, None)


# --- use cases with a fake Unit of Work -----------------------------------------------------------

def _client(cliente_id: int, celular: str | None, nombre="Ana", marca="Samsung") -> OrderClient:
    return OrderClient(cliente_id, nombre, "Pérez", celular, marca, "A54", 1, date(2026, 10, 1))


class FakeWhatsAppRepo:
    def __init__(self) -> None:
        self.campaigns: list[dict] = []
        self.messages: dict[int, dict] = {}
        self.optouts: set[str] = set()
        self.statuses: list[tuple] = []

    def create_campaign(self, **kwargs):
        self.campaigns.append(kwargs)
        return len(self.campaigns)

    def add_messages(self, campaign_id, messages):
        for cliente_id, telefono, parametros in messages:
            mid = len(self.messages) + 1
            self.messages[mid] = {"campaign": campaign_id, "cliente_id": cliente_id, "telefono": telefono,
                                  "parametros": parametros, "estado": WhatsAppMessageStatus.PENDIENTE}

    def pending_messages(self, campaign_id):
        return [
            PendingWhatsAppMessage(mid, m["telefono"], m["parametros"])
            for mid, m in self.messages.items()
            if m["campaign"] == campaign_id and m["estado"] == WhatsAppMessageStatus.PENDIENTE
        ]

    def mark_sent(self, message_id, wa_message_id):
        self.messages[message_id].update(estado=WhatsAppMessageStatus.ENVIADO, wa=wa_message_id)

    def mark_failed(self, message_id, error):
        self.messages[message_id].update(estado=WhatsAppMessageStatus.FALLIDO, error=error)

    def apply_status(self, wa_message_id, estado, error=None):
        self.statuses.append((wa_message_id, estado, error))
        return True

    def opted_out(self, telefonos):
        return self.optouts & set(telefonos)

    def set_opt_out(self, telefono, opted_out):
        (self.optouts.add if opted_out else self.optouts.discard)(telefono)


class FakeWorkOrders:
    def __init__(self, clients):
        self.clients = clients

    def order_clients(self, **_):
        return self.clients


class FakeUow:
    def __init__(self, clients=()):
        self.whatsapp = FakeWhatsAppRepo()
        self.work_orders = FakeWorkOrders(list(clients))
        self.commits = 0

    def commit(self):
        self.commits += 1

    @contextmanager
    def transaction(self):
        yield self
        self.commit()


class FakeGateway(WhatsAppGateway):
    def __init__(self, templates: list[WhatsAppTemplate], fail_for: set[str] = frozenset()) -> None:
        self._templates = templates
        self.fail_for = fail_for
        self.sent: list[OutgoingTemplate] = []
        self.uploads: list[str] = []

    def templates(self):
        return self._templates

    def upload_media(self, content, mime_type, filename):
        self.uploads.append(mime_type)
        return "MEDIA1"

    def send_template(self, message):
        if message.to in self.fail_for:
            raise WhatsAppError("Recipient phone number not in allowed list")
        self.sent.append(message)
        return f"wamid.{len(self.sent)}"

    def valid_signature(self, body, signature):
        return True


PROMO = WhatsAppTemplate("promo", "es", "MARKETING", "APPROVED", "Hola {{1}}, tu {{2}}", body_params=["1", "2"])
WITH_IMAGE = WhatsAppTemplate("promo_img", "es", "MARKETING", "APPROVED", "Hola", header_format="IMAGE")
ADMIN = User(email="admin@example.com", nombre="Admin", apellido="Sistema", id=1)
NAME_AND_BRAND = [TemplateParam(ParamSource.NOMBRE), TemplateParam(ParamSource.MARCA)]


def test_templates_query_returns_only_approved():
    pending = WhatsAppTemplate("nueva", "es", "MARKETING", "PENDING", "x")
    assert [t.name for t in ListWhatsAppTemplatesQuery(FakeGateway([pending, PROMO])).execute()] == ["promo"]


def test_campaign_skips_invalid_repeated_and_opted_out_numbers():
    uow = FakeUow([
        _client(1, "0991234567", nombre="Ana"),
        _client(2, "+593 99 123 4567"),  # same number as client 1
        _client(3, "096911155"),  # invalid
        _client(4, None),
        _client(5, "0987654321", nombre="Luis", marca="Xiaomi"),
        _client(6, "0981111111"),
        _client(7, "0982222222"),  # not chosen
    ])
    uow.whatsapp.optouts.add("593981111111")
    created = CreateWhatsAppCampaignUseCase(uow, FakeGateway([PROMO]), "593").execute(
        ADMIN, plantilla="promo", idioma="es", cliente_ids=[1, 2, 3, 4, 5, 6], parametros=NAME_AND_BRAND
    )
    assert (created.encolados, created.sin_numero, created.dados_de_baja) == (2, 3, 1)
    assert uow.whatsapp.campaigns == [{"plantilla": "promo", "idioma": "es", "categoria": "MARKETING", "created_by": 1}]
    assert [(m["telefono"], m["parametros"]) for m in uow.whatsapp.messages.values()] == [
        ("593991234567", [("1", "Ana"), ("2", "Samsung")]),
        ("593987654321", [("1", "Luis"), ("2", "Xiaomi")]),
    ]


def test_campaign_validates_template_params_and_media():
    uow = FakeUow([_client(1, "0991234567")])
    use_case = CreateWhatsAppCampaignUseCase(uow, FakeGateway([PROMO, WITH_IMAGE]), "593")
    run = lambda **kw: use_case.execute(ADMIN, cliente_ids=[1], **kw)  # noqa: E731
    with pytest.raises(NotFoundError):
        run(plantilla="otra", idioma="es", parametros=[])
    with pytest.raises(ValidationError, match="2 variable"):
        run(plantilla="promo", idioma="es", parametros=[TemplateParam(ParamSource.NOMBRE)])
    with pytest.raises(ValidationError, match="variables fijas"):
        run(plantilla="promo", idioma="es", parametros=[TemplateParam(ParamSource.NOMBRE), TemplateParam(ParamSource.TEXTO, " ")])
    with pytest.raises(ValidationError, match="necesita un archivo"):
        run(plantilla="promo_img", idioma="es", parametros=[])
    with pytest.raises(ValidationError, match="image/jpeg"):
        run(plantilla="promo_img", idioma="es", parametros=[], media=MediaFile(b"x", "video/mp4", "v.mp4"))
    with pytest.raises(ValidationError, match="no lleva imagen"):
        run(plantilla="promo", idioma="es", parametros=NAME_AND_BRAND, media=MediaFile(b"x", "image/png", "a.png"))
    assert uow.whatsapp.campaigns == []


def test_campaign_uploads_the_header_file_once():
    uow = FakeUow([_client(1, "0991234567"), _client(2, "0987654321")])
    gateway = FakeGateway([WITH_IMAGE])
    created = CreateWhatsAppCampaignUseCase(uow, gateway, "593").execute(
        ADMIN, plantilla="promo_img", idioma="es", cliente_ids=[1, 2], parametros=[],
        media=MediaFile(b"png", "image/png", "promo.png"),
    )
    assert gateway.uploads == ["image/png"]
    assert created.header_media == ("IMAGE", "MEDIA1")


def test_campaign_without_valid_recipients_is_rejected():
    uow = FakeUow([_client(1, "096911155")])
    with pytest.raises(ValidationError, match="celular válido"):
        CreateWhatsAppCampaignUseCase(uow, FakeGateway([PROMO]), "593").execute(
            ADMIN, plantilla="promo", idioma="es", cliente_ids=[1], parametros=NAME_AND_BRAND
        )


def test_sender_marks_each_message_sent_or_failed():
    uow = FakeUow()
    uow.whatsapp.add_messages(1, [(1, "593991234567", [("1", "Ana")]), (2, "593987654321", [("1", "Luis")])])
    gateway = FakeGateway([], fail_for={"593987654321"})
    SendWhatsAppCampaignUseCase(uow, gateway).execute(1, plantilla="promo", idioma="es", header_media=("IMAGE", "M"))

    assert [(m.to, m.body_values, m.header_media) for m in gateway.sent] == [
        ("593991234567", [("1", "Ana")], ("IMAGE", "M"))
    ]
    first, second = uow.whatsapp.messages.values()
    assert (first["estado"], first["wa"]) == (WhatsAppMessageStatus.ENVIADO, "wamid.1")
    assert (second["estado"], second["error"]) == (WhatsAppMessageStatus.FALLIDO, "Recipient phone number not in allowed list")
    assert uow.commits == 2  # progress saved after every message


def _webhook(value: dict) -> dict:
    return {"object": "whatsapp_business_account", "entry": [{"changes": [{"field": "messages", "value": value}]}]}


def test_webhook_applies_message_states():
    uow = FakeUow()
    HandleWhatsAppWebhookUseCase(uow).execute(_webhook({"statuses": [
        {"id": "wamid.1", "status": "delivered"},
        {"id": "wamid.2", "status": "failed", "errors": [{"code": 131026, "title": "Message undeliverable"}]},
        {"id": "wamid.3", "status": "deleted"},  # unknown status: ignored
    ]}))
    assert uow.whatsapp.statuses == [
        ("wamid.1", WhatsAppMessageStatus.ENTREGADO, None),
        ("wamid.2", WhatsAppMessageStatus.FALLIDO, "131026 - Message undeliverable"),
    ]


def test_webhook_replies_opt_out_and_back_in():
    uow = FakeUow()
    handle = HandleWhatsAppWebhookUseCase(uow).execute
    handle(_webhook({"messages": [{"from": "593991234567", "type": "text", "text": {"body": "baja"}}]}))
    handle(_webhook({"messages": [{"from": "593987654321", "type": "button", "button": {"text": "Detener promociones"}}]}))
    handle(_webhook({"messages": [{"from": "593980000000", "type": "text", "text": {"body": "¿Cuánto cuesta?"}}]}))
    assert uow.whatsapp.optouts == {"593991234567", "593987654321"}
    handle(_webhook({"messages": [{"from": "593991234567", "type": "text", "text": {"body": "ALTA"}}]}))
    assert uow.whatsapp.optouts == {"593987654321"}
