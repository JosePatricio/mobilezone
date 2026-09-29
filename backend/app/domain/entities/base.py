from __future__ import annotations

from datetime import datetime, timezone

from app.domain.exceptions import ValidationError


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def require_text(value: str | None, field: str, max_length: int | None = None) -> str:
    text = (value or "").strip()
    if not text:
        raise ValidationError(f"El campo '{field}' es obligatorio.", code="REQUIRED_FIELD", details={"field": field})
    if max_length is not None and len(text) > max_length:
        raise ValidationError(
            f"El campo '{field}' supera el máximo de {max_length} caracteres.",
            code="FIELD_TOO_LONG",
            details={"field": field},
        )
    return text


def optional_text(value: str | None) -> str | None:
    text = (value or "").strip()
    return text or None


class Activatable:
    """Mixin for entities with a boolean ``estado`` (logical activation)."""

    estado: bool

    def activate(self) -> None:
        self.estado = True

    def deactivate(self) -> None:
        self.estado = False

    def set_status(self, estado: bool) -> None:
        self.estado = bool(estado)
