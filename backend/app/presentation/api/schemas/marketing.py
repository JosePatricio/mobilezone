from __future__ import annotations

from datetime import date, datetime
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field, model_validator

from app.application.use_cases.roulette import MAX_ITEMS, MIN_ITEMS, RouletteState
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
    ruleta_id: int | None = Field(default=None, description="¿Incluir ruleta?: la variable RULETA lleva su enlace")
    enlace_base: Annotated[str | None, StringConstraints(pattern=r"^https?://[^\s/]+[^\s]*$", max_length=200)] = Field(
        default=None, description="Dirección de la página pública, p. ej. https://pixcell.net"
    )

    @model_validator(mode="after")
    def _has_recipients(self):
        if not self.cliente_ids and not self.numeros:
            raise ValueError("Elija al menos un cliente o escriba un número.")
        if self.ruleta_id is not None and not self.enlace_base:
            raise ValueError("Falta la dirección de la página de la ruleta.")
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


# --- Ruleta ---------------------------------------------------------------------------------------

class RouletteItemRequest(RequestSchema):
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    premio: bool = Field(default=True, description="False = opción sin premio (p. ej. Sigue intentando)")
    imagen: int | None = Field(default=None, ge=0, description="Posición del archivo en `images`")


class RouletteRequest(RequestSchema):
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=100)]
    fecha_inicio: date
    fecha_fin: date
    items: list[RouletteItemRequest] = Field(min_length=MIN_ITEMS, max_length=MAX_ITEMS)


class RouletteResponse(Schema):
    id: int
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    created_at: datetime
    creado_por: str | None
    items: int = Field(description="Opciones de la ruleta")
    enlaces: int = Field(description="Enlaces enviados en campañas")
    abiertos: int
    jugados: int
    ganadores: int


class RouletteItemResponse(Schema):
    id: int
    nombre: str
    premio: bool
    imagen: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def imagen_url(self) -> str | None:
        return media_url(self.imagen)


class RoulettePlayResponse(Schema):
    id: int
    cliente_id: int | None
    cliente: str | None
    telefono: str
    campaign_id: int | None
    created_at: datetime = Field(description="Cuándo se envió el enlace")
    abierto_at: datetime | None = Field(description="Primera vez que el cliente abrió el enlace")
    jugado_at: datetime | None = Field(description="Cuándo giró la ruleta (el enlace queda deshabilitado)")
    resultado: str | None = Field(description="Opción en la que se detuvo la ruleta")
    gano: bool


class RouletteDetailResponse(Schema):
    roulette: RouletteResponse
    items: list[RouletteItemResponse]
    links: list[RoulettePlayResponse]


class PublicRouletteResponse(Schema):
    nombre: str
    fecha_inicio: date
    fecha_fin: date
    items: list[RouletteItemResponse]
    estado: RouletteState
    resultado: int | None = Field(description="Posición en `items` de la opción ganada (ya jugó)")
    gano: bool
