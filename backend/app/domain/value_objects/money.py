from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal, InvalidOperation

from app.domain.exceptions import ValidationError

CENT = Decimal("0.01")
ZERO = Decimal("0.00")


def to_money(value: Decimal | int | float | str, field: str = "monto") -> Decimal:
    """Normalize a value to a 2-decimal ``Decimal`` suitable for money."""
    try:
        amount = value if isinstance(value, Decimal) else Decimal(str(value))
    except (InvalidOperation, ValueError, TypeError) as exc:
        raise ValidationError(f"El valor de '{field}' no es un monto válido.", code="INVALID_AMOUNT") from exc
    if not amount.is_finite():
        raise ValidationError(f"El valor de '{field}' no es un monto válido.", code="INVALID_AMOUNT")
    return amount.quantize(CENT, rounding=ROUND_HALF_UP)


def non_negative_money(value: Decimal | int | float | str, field: str = "monto") -> Decimal:
    amount = to_money(value, field)
    if amount < 0:
        raise ValidationError(f"El valor de '{field}' no puede ser negativo.", code="NEGATIVE_AMOUNT")
    return amount
