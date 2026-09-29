from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal

from app.domain.entities.base import Activatable, require_text
from app.domain.value_objects.money import non_negative_money


@dataclass(eq=False)
class SparePart(Activatable):
    tipo: str
    precio: Decimal
    ubicacion: bool = False
    garantia: bool = False
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.tipo = require_text(self.tipo, "tipo", 100)
        self.precio = non_negative_money(self.precio, "precio")
        self.ubicacion = bool(self.ubicacion)
        self.garantia = bool(self.garantia)
