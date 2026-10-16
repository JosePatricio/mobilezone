from __future__ import annotations

import json
import logging
from typing import Annotated

from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, Query, Request, UploadFile, status
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import PlainTextResponse, Response
from pydantic import ValidationError as PydanticValidationError
from sqlalchemy.orm import sessionmaker

from app.application.services.whatsapp import WhatsAppGateway
from app.application.use_cases.marketing import OrderClientsQuery
from app.application.use_cases.whatsapp import (
    CreateWhatsAppCampaignUseCase,
    HandleWhatsAppWebhookUseCase,
    ListWhatsAppTemplatesQuery,
    MediaFile,
    SendWhatsAppCampaignUseCase,
    TemplateParam,
    WhatsAppCampaignsQuery,
)
from app.domain.entities import User
from app.domain.exceptions import AuthenticationError, ConflictError, ValidationError
from app.domain.value_objects.permissions import Perm
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork
from app.presentation.api.dependencies import UowDep, require_permissions
from app.presentation.api.schemas.marketing import (
    OrderClientResponse,
    WhatsAppCampaignCreatedResponse,
    WhatsAppCampaignDetailResponse,
    WhatsAppCampaignRequest,
    WhatsAppCampaignResponse,
    WhatsAppTemplateResponse,
)

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/marketing", tags=["marketing"])
# Called by Meta (no session): verification of the URL and notifications of the WhatsApp account.
webhook_router = APIRouter(prefix="/whatsapp", tags=["whatsapp"])

CanManage = Annotated[User, Depends(require_permissions(Perm.MARKETING_MANAGE))]

# Same as client_max_body_size of nginx (Meta itself allows 5 MB images and 16 MB videos).
MAX_HEADER_BYTES = 10 * 1024 * 1024


def get_whatsapp(request: Request) -> WhatsAppGateway:
    gateway = request.app.state.whatsapp_gateway
    if gateway is None:
        raise ConflictError(
            "WhatsApp no está configurado en el servidor (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID, "
            "WHATSAPP_BUSINESS_ACCOUNT_ID).",
            code="WHATSAPP_NOT_CONFIGURED",
        )
    return gateway


WhatsAppDep = Annotated[WhatsAppGateway, Depends(get_whatsapp)]


@router.get("/recipients", response_model=list[OrderClientResponse])
def order_clients(
    uow: UowDep,
    _: CanManage,
    search: str | None = None,
    marca_id: int | None = None,
):
    """Recipients of the CRM messages: active clients with at least one work order (clients that
    only bought in Ventas are left out), with the brand of the phone of their most recent order."""
    return OrderClientsQuery(uow).execute(search=search, marca_id=marca_id)


@router.get("/whatsapp/templates", response_model=list[WhatsAppTemplateResponse])
def whatsapp_templates(_: CanManage, gateway: WhatsAppDep):
    """Templates approved by Meta for the WhatsApp Business account."""
    return ListWhatsAppTemplatesQuery(gateway).execute()


def send_campaign(
    session_factory: sessionmaker, gateway: WhatsAppGateway, interval: float, campaign_id: int, **kwargs
) -> None:
    """Background job: its own session, since the one of the request is already closed."""
    session = session_factory()
    try:
        SendWhatsAppCampaignUseCase(SqlAlchemyUnitOfWork(session), gateway, interval_seconds=interval).execute(
            campaign_id, **kwargs
        )
    except Exception:
        logger.exception("WhatsApp campaign %s stopped", campaign_id)
    finally:
        session.close()


@router.post(
    "/whatsapp/campaigns",
    response_model=WhatsAppCampaignCreatedResponse,
    status_code=status.HTTP_202_ACCEPTED,
)
def create_whatsapp_campaign(
    request: Request,
    background: BackgroundTasks,
    uow: UowDep,
    actor: CanManage,
    gateway: WhatsAppDep,
    data: Annotated[str, Form(description="WhatsAppCampaignRequest como JSON")],
    file: Annotated[UploadFile | None, File(description="Imagen / video / PDF del encabezado")] = None,
):
    """Queues an approved template for the chosen clients and sends it in the background.
    Multipart because the template header may need a file."""
    try:
        body = WhatsAppCampaignRequest.model_validate(json.loads(data))
    except (json.JSONDecodeError, PydanticValidationError) as exc:
        raise ValidationError("Datos de la campaña no válidos.", details=str(exc)) from exc
    media = None
    if file is not None:
        try:
            content = file.file.read(MAX_HEADER_BYTES + 1)
        finally:
            file.file.close()
        if len(content) > MAX_HEADER_BYTES:
            raise ValidationError("El archivo supera los 10 MB.", code="FILE_TOO_LARGE")
        media = MediaFile(content, file.content_type or "application/octet-stream", file.filename or "archivo")

    settings = request.app.state.settings
    created = CreateWhatsAppCampaignUseCase(uow, gateway, settings.whatsapp_country_code).execute(
        actor,
        plantilla=body.plantilla,
        idioma=body.idioma,
        cliente_ids=body.cliente_ids,
        numeros=body.numeros,
        parametros=[TemplateParam(p.source, p.texto) for p in body.parametros],
        media=media,
    )
    background.add_task(
        send_campaign,
        request.app.state.session_factory,
        gateway,
        settings.whatsapp_send_interval_seconds,
        created.campaign_id,
        plantilla=body.plantilla,
        idioma=body.idioma,
        header_media=created.header_media,
    )
    return created


@router.get("/whatsapp/campaigns", response_model=list[WhatsAppCampaignResponse])
def whatsapp_campaigns(uow: UowDep, _: CanManage):
    """Latest campaigns with how many messages are pending / sent / delivered / read / failed."""
    return WhatsAppCampaignsQuery(uow).list()


@router.get("/whatsapp/campaigns/{campaign_id}", response_model=WhatsAppCampaignDetailResponse)
def whatsapp_campaign(campaign_id: int, uow: UowDep, _: CanManage):
    return WhatsAppCampaignsQuery(uow).detail(campaign_id)


@webhook_router.get("/webhook", response_class=PlainTextResponse)
def verify_webhook(
    request: Request,
    mode: Annotated[str | None, Query(alias="hub.mode")] = None,
    token: Annotated[str | None, Query(alias="hub.verify_token")] = None,
    challenge: Annotated[str | None, Query(alias="hub.challenge")] = None,
):
    """Meta checks the callback URL once: it must answer the challenge when the token matches."""
    expected = request.app.state.settings.whatsapp_verify_token
    if mode != "subscribe" or not expected or token != expected:
        raise AuthenticationError("Token de verificación incorrecto.", code="WEBHOOK_FORBIDDEN")
    return challenge or ""


@webhook_router.post("/webhook", status_code=status.HTTP_200_OK)
async def receive_webhook(request: Request, gateway: WhatsAppDep):
    """Message states (sent, delivered, read, failed) and replies of the clients (BAJA / ALTA)."""
    body = await request.body()
    if not gateway.valid_signature(body, request.headers.get("X-Hub-Signature-256")):
        raise AuthenticationError("Firma del webhook no válida.", code="WEBHOOK_SIGNATURE")
    try:
        payload = json.loads(body)
    except json.JSONDecodeError as exc:
        raise ValidationError("JSON no válido.") from exc

    def handle() -> None:
        session = request.app.state.session_factory()
        try:
            HandleWhatsAppWebhookUseCase(SqlAlchemyUnitOfWork(session)).execute(payload)
        finally:
            session.close()

    await run_in_threadpool(handle)
    return Response(status_code=status.HTTP_200_OK)
