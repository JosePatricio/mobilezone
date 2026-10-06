from __future__ import annotations

from datetime import datetime
from decimal import Decimal
from typing import Annotated

from pydantic import Field, StringConstraints, computed_field

from app.domain.value_objects.affiliate_parts import (
    AFFILIATE_PART_STATUS_LABELS,
    AFFILIATE_PART_TYPE_LABELS,
    PART_CONDITION_LABELS,
    AffiliatePartStatus,
    AffiliatePartType,
    PartCondition,
)
from app.presentation.api.schemas.common import Money, RequestSchema, Schema
from app.presentation.api.schemas.work_orders import CatalogOption

PartDescription = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=500)]


class AffiliatePartRequest(RequestSchema):
    """Create / update. The affiliate is the logged user; the address shown is the one of their user."""

    tipo: AffiliatePartType
    condicion: PartCondition = Field(default=PartCondition.NUEVO, description="Nuevo / Usado")
    garantia: bool = False
    estado: AffiliatePartStatus = Field(default=AffiliatePartStatus.DISPONIBLE, description="Disponible / Vendido")
    descripcion: PartDescription = Field(default=None, description="Ej.: modelo de teléfono compatible")
    precio: Money | None = None


class AffiliatePartStatusRequest(RequestSchema):
    estado: AffiliatePartStatus


class AffiliateResponse(Schema):
    """Public contact data of the affiliate (from the users table)."""

    id: int
    nombre: str
    apellido: str
    celular: str | None
    direccion: str | None
    provincia: str | None
    ciudad: str | None


class AffiliatePartResponse(Schema):
    id: int
    tipo: AffiliatePartType
    condicion: PartCondition
    garantia: bool
    estado: AffiliatePartStatus
    descripcion: str | None
    precio: Decimal | None
    afiliado: AffiliateResponse = Field(validation_alias="user")
    created_at: datetime
    updated_at: datetime

    @computed_field  # type: ignore[prop-decorator]
    @property
    def tipo_label(self) -> str:
        return AFFILIATE_PART_TYPE_LABELS[self.tipo]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def condicion_label(self) -> str:
        return PART_CONDITION_LABELS[self.condicion]

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return AFFILIATE_PART_STATUS_LABELS[self.estado]


class AffiliatePartCatalogsResponse(Schema):
    tipos: list[CatalogOption]
    condiciones: list[CatalogOption]
    estados: list[CatalogOption]

    @classmethod
    def build(cls) -> "AffiliatePartCatalogsResponse":
        def options(labels: dict) -> list[CatalogOption]:
            return [CatalogOption(value=k.value, label=v) for k, v in labels.items()]

        return cls(
            tipos=options(AFFILIATE_PART_TYPE_LABELS),
            condiciones=options(PART_CONDITION_LABELS),
            estados=options(AFFILIATE_PART_STATUS_LABELS),
        )


class VisitsResponse(Schema):
    visitas: int = Field(description="Veces que el público visitó el catálogo de repuestos")
