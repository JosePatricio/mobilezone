from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import StringConstraints

from app.presentation.api.schemas.common import Description, RequestSchema, Schema


class PermissionResponse(Schema):
    id: int
    codigo: str
    descripcion: str | None


class RoleResponse(Schema):
    id: int
    nombre: str
    descripcion: str | None
    estado: bool
    permissions: list[PermissionResponse]
    created_at: datetime
    updated_at: datetime


class RoleRequest(RequestSchema):
    nombre: Annotated[str, StringConstraints(strip_whitespace=True, min_length=1, max_length=50)]
    descripcion: Description = None
    estado: bool = True
    permission_ids: list[int] | None = None


class RolePermissionsRequest(RequestSchema):
    permission_ids: list[int]
