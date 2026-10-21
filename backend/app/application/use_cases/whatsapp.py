"""Propaganda through the WhatsApp Cloud API: campaigns of an approved template, webhooks, opt-outs."""
from __future__ import annotations

import logging
import re
import time
from dataclasses import dataclass
from enum import Enum

from app.application.services.files import FileStorage
from app.application.services.whatsapp import (
    MEDIA_HEADERS,
    OutgoingTemplate,
    WhatsAppError,
    WhatsAppGateway,
    WhatsAppTemplate,
)
from app.application.use_cases.base import UseCase
from app.domain.entities import User
from app.domain.exceptions import NotFoundError, ValidationError
from app.domain.repositories import OrderClient, UnitOfWork, WhatsAppCampaignSummary, WhatsAppMessageRow
from app.domain.value_objects.whatsapp import (
    META_STATUSES,
    OPT_IN_KEYWORDS,
    OPT_OUT_KEYWORDS,
    normalize_keyword,
    whatsapp_number,
)

logger = logging.getLogger(__name__)

# File types of each media header (the MIME type of the upload must start with / be one of these).
MEDIA_MIME = {"IMAGE": ("image/jpeg", "image/png"), "VIDEO": ("video/mp4", "video/3gpp"), "DOCUMENT": ("application/pdf",)}
# Header images are kept for the preview of the campaign (folder under media/).
CAMPAIGN_IMAGES_FOLDER = "campaigns"
IMAGE_EXTENSIONS = {"image/jpeg": "jpg", "image/png": "png"}
# Largest file Meta accepts for each media header, in MB (the upload itself is capped at 10 MB by the API).
MEDIA_MAX_MB = {"IMAGE": 5, "VIDEO": 16, "DOCUMENT": 100}


class ParamSource(str, Enum):
    """Where the value of a template placeholder comes from, for each client."""

    NOMBRE = "NOMBRE"
    APELLIDO = "APELLIDO"
    NOMBRE_COMPLETO = "NOMBRE_COMPLETO"
    MARCA = "MARCA"  # brand of the phone of their most recent order (@TELEFONO of the CRM)
    MODELO = "MODELO"
    TEXTO = "TEXTO"  # same fixed text for everybody


@dataclass(frozen=True)
class TemplateParam:
    source: ParamSource
    texto: str | None = None


@dataclass(frozen=True)
class MediaFile:
    content: bytes
    mime_type: str
    filename: str


@dataclass(frozen=True)
class CampaignCreated:
    campaign_id: int
    encolados: int  # messages queued to be sent
    sin_numero: int  # clients skipped: no valid mobile number (or repeated number)
    dados_de_baja: int  # clients skipped: answered BAJA / STOP
    header_media: tuple[str, str] | None  # (IMAGE | VIDEO | DOCUMENT, media id) for the sender


@dataclass(frozen=True)
class CampaignDetail:
    campaign: WhatsAppCampaignSummary
    messages: list[WhatsAppMessageRow]


def _clean(value: str | None) -> str:
    # Meta rejects empty parameters and parameters with new lines, tabs or more than 4 spaces in a row.
    return re.sub(r"\s+", " ", value or "").strip() or "-"


def param_value(param: TemplateParam, client: OrderClient | None) -> str:
    """Value of a placeholder for one client; None = a number typed by hand (no client data)."""
    if client is None:
        return _clean({ParamSource.TEXTO: param.texto, ParamSource.NOMBRE: "Cliente"}.get(param.source))
    return _clean(
        {
            ParamSource.NOMBRE: client.nombre,
            ParamSource.APELLIDO: client.apellido,
            ParamSource.NOMBRE_COMPLETO: f"{client.nombre} {client.apellido}",
            ParamSource.MARCA: client.marca,
            ParamSource.MODELO: client.modelo,
            ParamSource.TEXTO: param.texto,
        }[param.source]
    )


class ListWhatsAppTemplatesQuery:
    """Approved templates: the only messages a business can send first."""

    def __init__(self, gateway: WhatsAppGateway) -> None:
        self.gateway = gateway

    def execute(self) -> list[WhatsAppTemplate]:
        approved = [t for t in self.gateway.templates() if t.status == "APPROVED"]
        return sorted(approved, key=lambda t: (t.name, t.language))


class CreateWhatsAppCampaignUseCase(UseCase):
    """Queues one approved template for the chosen clients of Órdenes; the sender delivers it."""

    def __init__(
        self, uow: UnitOfWork, gateway: WhatsAppGateway, country_code: str, storage: FileStorage | None = None
    ) -> None:
        super().__init__(uow)
        self.gateway = gateway
        self.country_code = country_code
        self.storage = storage  # keeps the header image for the preview; None = not kept

    def _template(self, name: str, language: str) -> WhatsAppTemplate:
        for template in self.gateway.templates():
            if template.name == name and template.language == language:
                if template.status != "APPROVED":
                    raise ValidationError("La plantilla aún no está aprobada por Meta.", code="TEMPLATE_NOT_APPROVED")
                if template.unsupported_params:
                    raise ValidationError(
                        "La plantilla tiene variables en el encabezado o en los botones; use una sin ellas.",
                        code="TEMPLATE_NOT_SUPPORTED",
                    )
                return template
        raise NotFoundError("La plantilla no existe en la cuenta de WhatsApp.", code="TEMPLATE_NOT_FOUND")

    def execute(
        self,
        actor: User,
        *,
        plantilla: str,
        idioma: str,
        cliente_ids: list[int],
        parametros: list[TemplateParam],
        media: MediaFile | None = None,
        numeros: list[str] | None = None,
    ) -> CampaignCreated:
        """`numeros`: extra phone numbers typed by hand (e.g. for a test), sent without client data."""
        template = self._template(plantilla, idioma)
        if len(parametros) != len(template.body_params):
            raise ValidationError(
                f"La plantilla tiene {len(template.body_params)} variable(s); se recibieron {len(parametros)}.",
                code="TEMPLATE_PARAMS",
            )
        if any(p.source == ParamSource.TEXTO and not (p.texto or "").strip() for p in parametros):
            raise ValidationError("Escriba el texto de las variables fijas.", code="TEMPLATE_PARAMS")
        if template.header_format in MEDIA_HEADERS:
            if media is None:
                raise ValidationError("La plantilla necesita un archivo para el encabezado.", code="MEDIA_REQUIRED")
            if media.mime_type not in MEDIA_MIME[template.header_format]:
                allowed = ", ".join(MEDIA_MIME[template.header_format])
                raise ValidationError(f"El archivo del encabezado debe ser {allowed}.", code="MEDIA_TYPE")
            max_mb = MEDIA_MAX_MB[template.header_format]
            if len(media.content) > max_mb * 1024 * 1024:
                raise ValidationError(f"El archivo del encabezado supera los {max_mb} MB.", code="FILE_TOO_LARGE")
        elif media is not None:
            raise ValidationError("La plantilla no lleva imagen ni video en el encabezado.", code="MEDIA_NOT_ALLOWED")

        wanted = set(cliente_ids)
        clients = [c for c in self.uow.work_orders.order_clients() if c.cliente_id in wanted]
        extra = numeros or []
        recipients: dict[str, OrderClient | None] = {}
        for celular, client in [(c.celular, c) for c in clients] + [(n, None) for n in extra]:
            number = whatsapp_number(celular, self.country_code)
            if number and number not in recipients:
                recipients[number] = client
        opted_out = self.uow.whatsapp.opted_out(list(recipients))
        queue = [
            (
                client.cliente_id if client else None,
                number,
                [(name, param_value(p, client)) for name, p in zip(template.body_params, parametros)],
            )
            for number, client in recipients.items()
            if number not in opted_out
        ]
        if not queue:
            raise ValidationError(
                "Ninguno de los clientes elegidos tiene un celular válido que acepte mensajes.", code="NO_RECIPIENTS"
            )

        header_media = None
        if media is not None:
            header_media = (template.header_format, self.gateway.upload_media(media.content, media.mime_type, media.filename))

        imagen = None
        if self.storage is not None and media is not None and template.header_format == "IMAGE":
            imagen = self.storage.save(CAMPAIGN_IMAGES_FOLDER, media.content, IMAGE_EXTENSIONS[media.mime_type])
        try:
            with self.uow.transaction():
                campaign_id = self.uow.whatsapp.create_campaign(
                    plantilla=template.name,
                    idioma=template.language,
                    categoria=template.category,
                    created_by=actor.id,
                    cuerpo=template.body,
                    encabezado=template.header_text if template.header_format == "TEXT" else None,
                    pie=template.footer,
                    imagen=imagen,
                )
                self.uow.whatsapp.add_messages(campaign_id, queue)
        except Exception:
            if imagen:
                self.storage.delete(imagen)
            raise
        return CampaignCreated(
            campaign_id=campaign_id,
            encolados=len(queue),
            sin_numero=len(wanted) + len(extra) - len(recipients),
            dados_de_baja=len(recipients) - len(queue),
            header_media=header_media,
        )


class SendWhatsAppCampaignUseCase(UseCase):
    """Sends the PENDIENTE messages of a campaign one by one (runs in the background)."""

    def __init__(self, uow: UnitOfWork, gateway: WhatsAppGateway, *, interval_seconds: float = 0.0) -> None:
        super().__init__(uow)
        self.gateway = gateway
        self.interval_seconds = interval_seconds

    def execute(self, campaign_id: int, *, plantilla: str, idioma: str, header_media: tuple[str, str] | None) -> None:
        for message in self.uow.whatsapp.pending_messages(campaign_id):
            outgoing = OutgoingTemplate(
                to=message.telefono,
                template=plantilla,
                language=idioma,
                body_values=message.parametros,
                header_media=header_media,
            )
            try:
                wa_id = self.gateway.send_template(outgoing)
            except WhatsAppError as exc:
                self.uow.whatsapp.mark_failed(message.id, exc.message)
            except Exception as exc:  # noqa: BLE001 - one broken message must not stop the campaign
                logger.exception("WhatsApp: unexpected error sending message %s", message.id)
                self.uow.whatsapp.mark_failed(message.id, f"Error inesperado: {exc}")
            else:
                self.uow.whatsapp.mark_sent(message.id, wa_id)
            self.uow.commit()  # progress is visible while the campaign is being sent
            if self.interval_seconds:
                time.sleep(self.interval_seconds)


class HandleWhatsAppWebhookUseCase(UseCase):
    """Notifications of Meta: state of the sent messages and replies of the clients (BAJA / ALTA)."""

    def execute(self, payload: dict) -> None:
        with self.uow.transaction():
            for entry in payload.get("entry") or []:
                for change in entry.get("changes") or []:
                    value = change.get("value") or {}
                    for status in value.get("statuses") or []:
                        self._status(status)
                    for message in value.get("messages") or []:
                        self._reply(message)

    def _status(self, status: dict) -> None:
        estado = META_STATUSES.get(status.get("status", ""))
        if estado is None or not status.get("id"):
            return
        errors = [
            " - ".join(filter(None, (str(e.get("code", "")), e.get("title") or e.get("message"), (e.get("error_data") or {}).get("details"))))
            for e in status.get("errors") or []
        ]
        self.uow.whatsapp.apply_status(status["id"], estado, "; ".join(errors) or None)

    def _reply(self, message: dict) -> None:
        text = (
            (message.get("text") or {}).get("body")
            or (message.get("button") or {}).get("text")
            or ((message.get("interactive") or {}).get("button_reply") or {}).get("title")
        )
        keyword = normalize_keyword(text)
        phone = message.get("from")
        if not phone:
            return
        if keyword in OPT_OUT_KEYWORDS:
            self.uow.whatsapp.set_opt_out(phone, True)
        elif keyword in OPT_IN_KEYWORDS:
            self.uow.whatsapp.set_opt_out(phone, False)


class WhatsAppCampaignsQuery(UseCase):
    def list(self) -> list[WhatsAppCampaignSummary]:
        return self.uow.whatsapp.campaigns()

    def detail(self, campaign_id: int) -> CampaignDetail:
        campaign = self.uow.whatsapp.campaign(campaign_id)
        if campaign is None:
            raise NotFoundError("Campaña no encontrada.", code="CAMPAIGN_NOT_FOUND")
        return CampaignDetail(campaign, self.uow.whatsapp.campaign_messages(campaign_id))
