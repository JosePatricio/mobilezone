from __future__ import annotations

from app.presentation.api.schemas.common import RequestSchema, Schema


class ResetDataRequest(RequestSchema):
    confirmacion: str


class ResetDataResponse(Schema):
    eliminados: dict[str, int]
