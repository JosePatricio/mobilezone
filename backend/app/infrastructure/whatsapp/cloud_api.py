"""WhatsApp Business Platform: Meta Cloud API over the Graph API (https://graph.facebook.com)."""
from __future__ import annotations

import hashlib
import hmac
import re

import httpx

from app.application.services.whatsapp import (
    MEDIA_HEADERS,
    OutgoingTemplate,
    WhatsAppError,
    WhatsAppGateway,
    WhatsAppTemplate,
)

GRAPH_URL = "https://graph.facebook.com"
PLACEHOLDER = re.compile(r"\{\{\s*(\w+)\s*\}\}")
# Button types whose value changes per message (they need a parameter on every send).
PARAM_BUTTONS = {"COPY_CODE", "OTP", "CATALOG", "MPM", "FLOW"}


def placeholders(text: str | None) -> list[str]:
    """Placeholders of a template text in order of appearance, without repeats: "{{1}} {{2}}" -> ["1", "2"]."""
    seen: list[str] = []
    for name in PLACEHOLDER.findall(text or ""):
        if name not in seen:
            seen.append(name)
    return seen


def parse_template(data: dict) -> WhatsAppTemplate:
    body = header_format = header_text = footer = None
    unsupported = False
    for component in data.get("components", []):
        kind = component.get("type")
        if kind == "BODY":
            body = component.get("text", "")
        elif kind == "HEADER":
            header_format = component.get("format")
            header_text = component.get("text")
            unsupported |= bool(placeholders(header_text)) or header_format not in ("TEXT", *MEDIA_HEADERS)
        elif kind == "FOOTER":
            footer = component.get("text")
        elif kind == "BUTTONS":
            for button in component.get("buttons", []):
                unsupported |= button.get("type") in PARAM_BUTTONS or bool(placeholders(button.get("url")))
        else:  # carousel, limited time offer...
            unsupported = True
    return WhatsAppTemplate(
        name=data["name"],
        language=data.get("language", ""),
        category=data.get("category", ""),
        status=data.get("status", ""),
        body=body or "",
        header_format=header_format,
        header_text=header_text,
        footer=footer,
        body_params=placeholders(body),
        unsupported_params=unsupported,
    )


def template_payload(message: OutgoingTemplate) -> dict:
    components: list[dict] = []
    if message.header_media:
        kind, media_id = message.header_media
        key = kind.lower()
        components.append({"type": "header", "parameters": [{"type": key, key: {"id": media_id}}]})
    if message.body_values:
        parameters = []
        for name, value in message.body_values:
            parameter = {"type": "text", "text": value}
            if not name.isdigit():
                parameter["parameter_name"] = name  # templates with named placeholders
            parameters.append(parameter)
        components.append({"type": "body", "parameters": parameters})
    template: dict = {"name": message.template, "language": {"code": message.language}}
    if components:
        template["components"] = components
    return {
        "messaging_product": "whatsapp",
        "recipient_type": "individual",
        "to": message.to,
        "type": "template",
        "template": template,
    }


class CloudApiWhatsAppGateway(WhatsAppGateway):
    def __init__(
        self,
        *,
        access_token: str,
        phone_number_id: str,
        business_account_id: str,
        app_secret: str | None,
        api_version: str,
        transport: httpx.BaseTransport | None = None,
    ) -> None:
        self.phone_number_id = phone_number_id
        self.business_account_id = business_account_id
        self.app_secret = app_secret
        self.client = httpx.Client(
            base_url=f"{GRAPH_URL}/{api_version}",
            headers={"Authorization": f"Bearer {access_token}"},
            timeout=30,
            transport=transport,
        )

    def _request(self, method: str, url: str, **kwargs) -> dict:
        try:
            response = self.client.request(method, url, **kwargs)
        except httpx.HTTPError as exc:
            raise WhatsAppError(f"No se pudo conectar con WhatsApp: {exc}", code="WHATSAPP_UNREACHABLE") from exc
        data = response.json() if response.content else {}
        if response.is_error:
            error = data.get("error", {}) if isinstance(data, dict) else {}
            detail = error.get("error_data", {}).get("details") or error.get("error_user_msg")
            message = error.get("message") or f"HTTP {response.status_code}"
            raise WhatsAppError(
                f"{message} ({detail})" if detail else message,
                details={"meta_code": error.get("code"), "status": response.status_code},
            )
        return data

    def templates(self) -> list[WhatsAppTemplate]:
        url: str | None = f"/{self.business_account_id}/message_templates"
        params: dict | None = {"fields": "name,language,status,category,components", "limit": 100}
        result: list[WhatsAppTemplate] = []
        while url:
            data = self._request("GET", url, params=params)
            result.extend(parse_template(t) for t in data.get("data", []))
            url, params = data.get("paging", {}).get("next"), None  # "next" is an absolute URL with its query
        return result

    def upload_media(self, content: bytes, mime_type: str, filename: str) -> str:
        data = self._request(
            "POST",
            f"/{self.phone_number_id}/media",
            data={"messaging_product": "whatsapp", "type": mime_type},
            files={"file": (filename, content, mime_type)},
        )
        return data["id"]

    def send_template(self, message: OutgoingTemplate) -> str:
        data = self._request("POST", f"/{self.phone_number_id}/messages", json=template_payload(message))
        return data["messages"][0]["id"]

    def valid_signature(self, body: bytes, signature: str | None) -> bool:
        if not self.app_secret or not signature or not signature.startswith("sha256="):
            return False
        expected = hmac.new(self.app_secret.encode(), body, hashlib.sha256).hexdigest()
        return hmac.compare_digest(expected, signature.removeprefix("sha256="))
