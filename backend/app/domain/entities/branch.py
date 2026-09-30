from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime

from app.domain.entities.base import Activatable, optional_text, require_text


@dataclass(eq=False)
class Branch(Activatable):
    """A branch (sucursal): where products are stocked and sold."""

    nombre: str
    ubicacion: str
    telefono: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.ubicacion = require_text(self.ubicacion, "ubicacion", 255)
        self.telefono = optional_text(self.telefono)
