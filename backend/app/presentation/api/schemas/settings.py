from __future__ import annotations

from decimal import Decimal

from pydantic import Field

from app.presentation.api.schemas.common import Money, RequestSchema, Schema


class SalesGoalsRequest(RequestSchema):
    baja: Money = Field(description="Debajo de este monto vendido en el día: 😞")
    alta: Money = Field(description="Sobre este monto: 🤑 (entre ambas metas: 😊)")


class SalesGoalsResponse(Schema):
    baja: Decimal
    alta: Decimal
