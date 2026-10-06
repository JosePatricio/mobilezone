"""Work order catalogs: entry reason, display type and device lock; warranty time rule.

Labels are centralized here and exposed through ``GET /work-orders/catalogs`` so the
frontend never hardcodes them.
"""
from __future__ import annotations

import re
from enum import Enum

from app.domain.exceptions import ValidationError


class EntryReason(str, Enum):
    """Motivo de ingreso del equipo."""

    CAMBIO_DISPLAY = "CAMBIO_DISPLAY"
    PANTALLA = "PANTALLA"
    PIN_CARGA = "PIN_CARGA"
    BATERIA = "BATERIA"
    TAPA = "TAPA"
    CRISTAL_CAMARA = "CRISTAL_CAMARA"
    GLASS = "GLASS"
    DIAGNOSTICO = "DIAGNOSTICO"
    FLEX_BOTONES = "FLEX_BOTONES"
    REEMPLAZO_MAINBOARD = "REEMPLAZO_MAINBOARD"
    FRP_GOOGLE = "FRP_GOOGLE"
    ISP = "ISP"
    BYPASS = "BYPASS"
    OTROS = "OTROS"


ENTRY_REASON_LABELS: dict[EntryReason, str] = {
    EntryReason.CAMBIO_DISPLAY: "Cambio de display",
    EntryReason.PANTALLA: "Pantalla",
    EntryReason.PIN_CARGA: "PIN de carga",
    EntryReason.BATERIA: "Batería",
    EntryReason.TAPA: "Tapa",
    EntryReason.CRISTAL_CAMARA: "Cristal de cámara",
    EntryReason.GLASS: "Glass",
    EntryReason.DIAGNOSTICO: "Diagnóstico",
    EntryReason.FLEX_BOTONES: "Flex botones",
    EntryReason.REEMPLAZO_MAINBOARD: "Reemplazo mainboard",
    EntryReason.FRP_GOOGLE: "FRP Google",
    EntryReason.ISP: "ISP",
    EntryReason.BYPASS: "ByPass",
    EntryReason.OTROS: "Otros",
}


class DisplayType(str, Enum):
    """Only for ``CAMBIO_DISPLAY``."""

    INCELL = "INCELL"
    OLED = "OLED"
    ORIGINAL = "ORIGINAL"


DISPLAY_TYPE_LABELS: dict[DisplayType, str] = {
    DisplayType.INCELL: "INCELL",
    DisplayType.OLED: "OLED",
    DisplayType.ORIGINAL: "ORIGINAL",
}


MAX_WARRANTY_DAYS = 3650


def validate_warranty_days(value: int | None) -> int:
    """Tiempo de garantía in days (0 = sin garantía)."""
    if value is None:
        return 0
    if isinstance(value, bool) or not isinstance(value, int) or not 0 <= value <= MAX_WARRANTY_DAYS:
        raise ValidationError(
            f"El tiempo de garantía debe ser un número de días entre 0 y {MAX_WARRANTY_DAYS}.",
            code="INVALID_WARRANTY_DAYS",
            details={"field": "garantia_dias"},
        )
    return value


class LockType(str, Enum):
    """How the device is unlocked (needed by the technician to test it)."""

    NINGUNO = "NINGUNO"
    PATRON = "PATRON"  # Android 3x3 pattern, stored as the dot sequence "1-5-9-6" (dots 1..9, row by row)
    PIN = "PIN"


LOCK_TYPE_LABELS: dict[LockType, str] = {
    LockType.NINGUNO: "Sin bloqueo",
    LockType.PATRON: "Patrón",
    LockType.PIN: "PIN",
}


def _parse(enum_cls, value, field: str, message: str):
    try:
        return enum_cls(value)
    except ValueError as exc:
        raise ValidationError(message, code="INVALID_OPTION", details={"field": field}) from exc


def validate_entry(motivo: str, tipo_display: str | None) -> tuple[EntryReason, DisplayType | None]:
    """The display type is required for ``CAMBIO_DISPLAY`` and not allowed otherwise."""
    reason = _parse(EntryReason, motivo, "motivo_ingreso", "Seleccione un motivo de ingreso válido.")
    if reason == EntryReason.CAMBIO_DISPLAY:
        if not tipo_display:
            raise ValidationError(
                "Seleccione el tipo de display (INCELL, OLED u ORIGINAL).",
                code="DISPLAY_TYPE_REQUIRED",
                details={"field": "tipo_display"},
            )
        return reason, _parse(DisplayType, tipo_display, "tipo_display", "Tipo de display inválido.")
    return reason, None


def validate_lock(tipo: str, valor: str | None) -> tuple[LockType, str | None]:
    """Pattern: 4 to 9 different dots (1..9) as "1-5-9-6". PIN: 4 to 12 digits."""
    lock = _parse(LockType, tipo, "bloqueo_tipo", "Tipo de bloqueo inválido.")
    text = (valor or "").strip()
    if lock == LockType.NINGUNO:
        return lock, None
    if lock == LockType.PIN:
        if not re.fullmatch(r"\d{4,12}", text):
            raise ValidationError(
                "El PIN debe tener entre 4 y 12 dígitos.", code="INVALID_PIN", details={"field": "bloqueo_valor"}
            )
        return lock, text
    dots = text.split("-") if text else []
    if not (4 <= len(dots) <= 9) or any(d not in "123456789" or len(d) != 1 for d in dots) or len(set(dots)) != len(dots):
        raise ValidationError(
            "Dibuje un patrón que una al menos 4 puntos.", code="INVALID_PATTERN", details={"field": "bloqueo_valor"}
        )
    return lock, "-".join(dots)
