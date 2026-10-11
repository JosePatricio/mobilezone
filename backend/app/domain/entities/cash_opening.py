from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.value_objects.money import non_negative_money

if TYPE_CHECKING:
    from app.domain.entities.branch import Branch


@dataclass(eq=False)
class CashOpening:
    """Apertura de caja: the first time each day a seller enters Ventas they say in which branch
    they are working and how much cash (USD) the register starts with to give change."""

    user_id: int
    branch_id: int
    fecha: date  # local day of the shop
    monto_inicial: Decimal
    id: int | None = None
    created_at: datetime | None = None

    if TYPE_CHECKING:
        branch: Branch

    def __post_init__(self) -> None:
        self.monto_inicial = non_negative_money(self.monto_inicial, "monto_inicial")
