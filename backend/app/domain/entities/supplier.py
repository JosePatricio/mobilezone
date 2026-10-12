from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.domain.entities.base import Activatable, optional_text, require_text


def _limited(value: str | None, field: str, max_length: int) -> str | None:
    text = optional_text(value)
    return require_text(text, field, max_length) if text else None


@dataclass(eq=False)
class Supplier(Activatable):
    """A supplier (proveedor) of the products. Only ``nombre`` is required."""

    nombre: str
    ruc: str | None = None
    telefono: str | None = None
    email: str | None = None
    direccion: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 150)
        self.ruc = _limited(self.ruc, "ruc", 20)
        self.telefono = _limited(self.telefono, "telefono", 20)
        self.email = _limited(self.email, "email", 255)
        self.direccion = _limited(self.direccion, "direccion", 255)
