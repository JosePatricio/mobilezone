from __future__ import annotations

from datetime import date

from pydantic import Field

from app.presentation.api.schemas.common import Schema


class OrderClientResponse(Schema):
    cliente_id: int
    nombre: str
    apellido: str
    celular: str | None
    marca: str = Field(description="Marca del teléfono de su orden más reciente (variable @TELEFONO)")
    modelo: str
    ordenes: int = Field(description="Órdenes de trabajo del cliente")
    ultima_orden: date = Field(description="Fecha de recepción de su orden más reciente")
