from __future__ import annotations

from datetime import datetime
from typing import Annotated

from pydantic import EmailStr, Field, StringConstraints, computed_field

from app.presentation.api.schemas.common import Name, RequestSchema, Schema, media_url

Identificacion = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^\d{10}(\d{3})?$"),
    Field(description="Cédula (10) o RUC (13), validados con el algoritmo ecuatoriano"),
]
Celular = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)]
Provincia = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)]
Ciudad = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)]


class BranchRef(Schema):
    id: int
    nombre: str


class LoginRequest(RequestSchema):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class RoleSummary(Schema):
    id: int
    nombre: str


class _WithPhoto(Schema):
    foto: str | None = Field(default=None, exclude=True)

    @computed_field  # type: ignore[prop-decorator]
    @property
    def foto_url(self) -> str | None:
        return media_url(self.foto)


class UserSummary(_WithPhoto):
    id: int
    nombre: str
    apellido: str
    email: str


class UserResponse(_WithPhoto):
    """Never includes the password hash. The role defines the kind of user."""

    id: int
    nombre: str
    apellido: str
    email: str
    identificacion: str | None
    celular: str | None
    provincia: str | None
    ciudad: str | None
    rol_id: int
    role: RoleSummary
    branches: list[BranchRef] = Field(description="Sucursales asignadas")
    estado: bool
    created_at: datetime
    updated_at: datetime


class CurrentUserResponse(Schema):
    user: UserResponse
    permissions: list[str]


class TokenResponse(Schema):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserResponse
    permissions: list[str]


class UserRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: EmailStr
    password: str | None = Field(
        default=None,
        min_length=8,
        max_length=128,
        description="Obligatoria al crear (salvo rol CLIENTE). Al editar, vacío = no cambiar.",
    )
    rol_id: int
    identificacion: Identificacion | None = None
    celular: Celular = None
    provincia: Provincia = None
    ciudad: Ciudad = None
    estado: bool = True
    branch_ids: list[int] = Field(default_factory=list, description="Sucursales (obligatorio para VENDEDOR)")


class ClientRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: EmailStr
    identificacion: Identificacion
    celular: Celular = None
    provincia: Provincia = None
    ciudad: Ciudad = None
    estado: bool = True


class ClientSummary(Schema):
    id: int
    nombre: str
    apellido: str
    identificacion: str | None
    celular: str | None


class ClientResponse(_WithPhoto):
    id: int
    nombre: str
    apellido: str
    email: str
    identificacion: str | None
    celular: str | None
    provincia: str | None
    ciudad: str | None
    estado: bool
    created_at: datetime
    updated_at: datetime
