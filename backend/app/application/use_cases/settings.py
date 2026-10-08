from __future__ import annotations

from dataclasses import dataclass
from decimal import Decimal

from app.application.use_cases.base import UseCase
from app.domain.exceptions import ValidationError
from app.domain.value_objects.money import non_negative_money

# Keys in the settings table.
GOAL_LOW = "ventas_meta_baja"
GOAL_HIGH = "ventas_meta_alta"
DEFAULT_GOAL_LOW = Decimal("20.00")
DEFAULT_GOAL_HIGH = Decimal("50.00")


@dataclass(frozen=True)
class SalesGoals:
    """Daily sales of a user, shown in the header with an emoji:
    below ``baja`` 😞, from ``baja`` to ``alta`` 😊, above ``alta`` 🤑."""

    baja: Decimal = DEFAULT_GOAL_LOW
    alta: Decimal = DEFAULT_GOAL_HIGH

    def __post_init__(self) -> None:
        baja = non_negative_money(self.baja, "baja")
        alta = non_negative_money(self.alta, "alta")
        if alta <= baja:
            raise ValidationError(
                "La meta alta debe ser mayor que la meta baja.", code="INVALID_SALES_GOALS", details={"field": "alta"}
            )
        object.__setattr__(self, "baja", baja)
        object.__setattr__(self, "alta", alta)


class SalesGoalsUseCases(UseCase):
    def get(self) -> SalesGoals:
        values = self.uow.settings.get_values([GOAL_LOW, GOAL_HIGH])
        try:
            return SalesGoals(
                baja=Decimal(values.get(GOAL_LOW, DEFAULT_GOAL_LOW)),
                alta=Decimal(values.get(GOAL_HIGH, DEFAULT_GOAL_HIGH)),
            )
        except (ArithmeticError, ValidationError):
            return SalesGoals()  # stored values damaged by hand: defaults

    def update(self, baja: Decimal, alta: Decimal) -> SalesGoals:
        goals = SalesGoals(baja=baja, alta=alta)
        with self.uow.transaction():
            self.uow.settings.set_value(GOAL_LOW, str(goals.baja))
            self.uow.settings.set_value(GOAL_HIGH, str(goals.alta))
        return goals
