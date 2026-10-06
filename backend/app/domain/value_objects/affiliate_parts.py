"""Catalogs of the affiliate spare parts (repuestos de afiliados).

Labels are centralized here and exposed through ``GET /public/affiliate-parts/catalogs``
so the frontend never hardcodes them.
"""
from __future__ import annotations

from enum import Enum


class AffiliatePartType(str, Enum):
    """Tipo de repuesto."""

    CAMARAS = "CAMARAS"
    PLACA_PRINCIPAL = "PLACA_PRINCIPAL"
    BATERIA = "BATERIA"
    PLACA_CARGA = "PLACA_CARGA"
    ANTENAS = "ANTENAS"
    CRISTAL_CAMARA = "CRISTAL_CAMARA"
    TAPAS = "TAPAS"
    DISPLAY = "DISPLAY"
    BACK_COVER = "BACK_COVER"


AFFILIATE_PART_TYPE_LABELS: dict[AffiliatePartType, str] = {
    AffiliatePartType.CAMARAS: "Cámaras",
    AffiliatePartType.PLACA_PRINCIPAL: "Placa principal",
    AffiliatePartType.BATERIA: "Batería",
    AffiliatePartType.PLACA_CARGA: "Placa de carga",
    AffiliatePartType.ANTENAS: "Antenas",
    AffiliatePartType.CRISTAL_CAMARA: "Cristal de cámara",
    AffiliatePartType.TAPAS: "Tapas",
    AffiliatePartType.DISPLAY: "Display",
    AffiliatePartType.BACK_COVER: "BackCover",
}


class PartCondition(str, Enum):
    """Estado físico del repuesto."""

    NUEVO = "NUEVO"
    USADO = "USADO"


PART_CONDITION_LABELS: dict[PartCondition, str] = {
    PartCondition.NUEVO: "Nuevo",
    PartCondition.USADO: "Usado",
}


class AffiliatePartStatus(str, Enum):
    """Disponibilidad del repuesto."""

    DISPONIBLE = "DISPONIBLE"
    VENDIDO = "VENDIDO"


AFFILIATE_PART_STATUS_LABELS: dict[AffiliatePartStatus, str] = {
    AffiliatePartStatus.DISPONIBLE: "Disponible",
    AffiliatePartStatus.VENDIDO: "Vendido",
}

# Key of the public catalog page in ``page_visits``.
PUBLIC_CATALOG_PAGE = "repuestos_afiliados"
