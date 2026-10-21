from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field, model_validator

from app.application.use_cases.whatsapp import ParamSource
from app.domain.value_objects.whatsapp import WhatsAppMessageStatus
from app.presentation.api.schemas.common import RequestSchema, Schema, media_url


class OrderClientResponse(Schema):
    cliente_id: int
    nombre: str
    apellido: str
    celular: str | None
    marca: str = Field(description="Marca del teléfono de su orden más reciente (variable @TELEFONO)")
    modelo: str
    ordenes: int = Field(description="Órdenes de trabajo del cliente")
    ultima_orden: date = Field(description="Fecha de recepción de su orden más reciente")
    identificacion: str | None = Field(default=None, description="Cédula / RUC del cliente")


class WhatsAppTemplateResponse(Schema):
    name: str
    language: str
    category: str = Field(description="MARKETING | UTILITY | AUTHENTICATION")
    body: str = Field(description="Texto con variables {{1}} o {{nombre}}")
    header_format: str | None = Field(description="TEXT | IMAGE | VIDEO | DOCUMENT")
    header_text: str | None
    footer: str | None
    body_params: list[str] = Field(description="Variables del cuerpo en orden")
    unsupported_params: bool = Field(description="Tiene variables en encabezado o botones: no se puede usar")


class TemplateParamRequest(RequestSchema):
    source: ParamSource
    texto: Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)] = None


class WhatsAppCampaignRequest(RequestSchema):
    plantilla: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=512)]
    idioma: Annotated[str, StringConstraints(strip_whitespace=True, min_length=2, max_length=15)]
    cliente_ids: list[int] = Field(default_factory=list, max_length=5000)
    numeros: list[Annotated[str, StringConstraints(strip_whitespace=True, max_length=20)]] = Field(
        default_factory=list, max_length=50, description="Números escritos a mano (pruebas), sin datos de cliente"
    )
    parametros: list[TemplateParamRequest] = Field(default_factory=list, max_length=20)

    @model_validator(mode="after")
    def _has_recipients(self):
        if not self.cliente_ids and not self.numeros:
            raise ValueError("Elija al menos un cliente o escriba un número.")
        return self


class WhatsAppCampaignCreatedResponse(Schema):
    campaign_id: int
    encolados: int = Field(description="Mensajes que se van a enviar")
    sin_numero: int = Field(description="Clientes omitidos: sin celular válido o con un número repetido")
    dados_de_baja: int = Field(description="Clientes omitidos: respondieron BAJA / STOP")


class WhatsAppCampaignResponse(Schema):
    id: int
    plantilla: str
    idioma: str
    categoria: str
    created_at: datetime
    creado_por: str | None
    total: int
    pendientes: int
    enviados: int
    entregados: int
    leidos: int
    fallidos: int


class WhatsAppCampaignPreviewResponse(WhatsAppCampaignResponse):
    """The campaign with what was sent: text of the template and header image."""

    cuerpo: str | None = Field(description="Texto de la plantilla con sus variables {{1}}")
    encabezado: str | None = Field(description="Encabezado de texto de la plantilla")
    pie: str | None = Field(description="Pie de la plantilla")
    imagen: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def imagen_url(self) -> str | None:
        return media_url(self.imagen)


class WhatsAppMessageResponse(Schema):
    id: int
    cliente_id: int | None
    cliente: str | None
    telefono: str
    estado: WhatsAppMessageStatus
    error: str | None
    updated_at: datetime
    parametros: list[tuple[str, str]] = Field(description="(variable, valor) enviados a este número")


class WhatsAppCampaignDetailResponse(Schema):
    campaign: WhatsAppCampaignPreviewResponse
    messages: list[WhatsAppMessageResponse]
