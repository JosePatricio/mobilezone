from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from typing import TYPE_CHECKING

from app.domain.entities.base import Activatable, optional_text, require_text


@dataclass(eq=False)
class Category(Activatable):
    nombre: str
    descripcion: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.descripcion = optional_text(self.descripcion)


@dataclass(eq=False)
class Brand(Activatable):
    nombre: str
    descripcion: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        modelos_count: int  # read-only: number of models of the brand

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.descripcion = optional_text(self.descripcion)


@dataclass(eq=False)
class DeviceModel(Activatable):
    """A device model (table ``models``). Named DeviceModel to avoid ambiguity."""

    brand_id: int
    nombre: str
    descripcion: str | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        brand: Brand

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.descripcion = optional_text(self.descripcion)
