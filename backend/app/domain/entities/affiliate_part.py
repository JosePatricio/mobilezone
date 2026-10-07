from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import optional_text
from app.domain.exceptions import ValidationError
from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.money import non_negative_money

if TYPE_CHECKING:
    from app.domain.entities.user import User

MAX_DESCRIPTION = 500


@dataclass(eq=False)
class AffiliatePart:
    """A spare part published by an affiliate (technician). Public: everyone can see it.

    The address shown to the public is the one of the affiliate user (``users.direccion``).
    """

    user_id: int  # affiliate who published it
    tipo: AffiliatePartType
    condicion: PartCondition = PartCondition.NUEVO
    garantia: bool = False
    estado: AffiliatePartStatus = AffiliatePartStatus.DISPONIBLE
    descripcion: str | None = None  # e.g. compatible phone model
    precio: Decimal | None = None  # optional: to be agreed with the affiliate
    imagen: str | None = None  # relative path in the media storage
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        user: User

    def __post_init__(self) -> None:
        self.tipo = AffiliatePartType(self.tipo)
        self.condicion = PartCondition(self.condicion)
        self.estado = AffiliatePartStatus(self.estado)
        self.garantia = bool(self.garantia)
        self.descripcion = optional_text(self.descripcion)
        if self.descripcion and len(self.descripcion) > MAX_DESCRIPTION:
            raise ValidationError(
                f"El campo 'descripcion' supera el máximo de {MAX_DESCRIPTION} caracteres.",
                code="FIELD_TOO_LONG",
                details={"field": "descripcion"},
            )
        self.precio = non_negative_money(self.precio, "precio") if self.precio is not None else None

    def is_owned_by(self, user_id: int | None) -> bool:
        return user_id is not None and self.user_id == user_id
