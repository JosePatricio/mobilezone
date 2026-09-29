from __future__ import annotations

from datetime import datetime

from pydantic import EmailStr, Field

from app.domain.value_objects.enums import UserType
from app.presentation.api.schemas.common import Name, RequestSchema, Schema


class LoginRequest(RequestSchema):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)


class RoleSummary(Schema):
    id: int
    nombre: str


class UserSummary(Schema):
    id: int
    nombre: str
    apellido: str
    email: str


class UserResponse(Schema):
    """Never includes the password hash."""

    id: int
    nombre: str
    apellido: str
    email: str
    tipo_usuario: UserType
    rol_id: int | None
    role: RoleSummary | None = None
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


class CreateUserRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=128)
    tipo_usuario: UserType
    rol_id: int | None = None
    estado: bool = True


class UpdateUserRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: EmailStr
    password: str | None = Field(default=None, min_length=8, max_length=128, description="Vacío = no cambiar")
    tipo_usuario: UserType
    rol_id: int | None = None
    estado: bool = True


class ClientRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: EmailStr
    estado: bool = True


class ClientResponse(Schema):
    id: int
    nombre: str
    apellido: str
    email: str
    estado: bool
    created_at: datetime
    updated_at: datetime
