from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from app.domain.entities.base import Activatable, optional_text, require_text
from app.domain.value_objects.enums import UserType


@dataclass(eq=False)
class Permission:
    codigo: str
    descripcion: str | None = None
    id: int | None = None


@dataclass(eq=False)
class Role(Activatable):
    nombre: str
    descripcion: str | None = None
    estado: bool = True
    permissions: list[Permission] = field(default_factory=list)
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 50).upper()
        self.descripcion = optional_text(self.descripcion)

    @property
    def permission_codes(self) -> set[str]:
        if not self.estado:
            return set()
        return {p.codigo for p in self.permissions}

    def set_permissions(self, permissions: list[Permission]) -> None:
        self.permissions[:] = permissions


@dataclass(eq=False)
class User(Activatable):
    """A system user. Internal users and clients share this entity.

    ``password`` always holds a password *hash*, never plain text. Clients may
    have no password (login rules for clients are pending definition).
    """

    nombre: str
    apellido: str
    email: str
    tipo_usuario: UserType
    password: str | None = None
    rol_id: int | None = None
    estado: bool = True
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        role: Role | None

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.apellido = require_text(self.apellido, "apellido", 100)
        self.email = require_text(self.email, "email", 255).lower()
        self.tipo_usuario = UserType(self.tipo_usuario)

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}"

    @property
    def is_technician(self) -> bool:
        return self.tipo_usuario == UserType.TECNICO

    @property
    def is_client(self) -> bool:
        return self.tipo_usuario == UserType.CLIENTE

    @property
    def permissions(self) -> set[str]:
        role = getattr(self, "role", None)
        if not self.estado or role is None:
            return set()
        return role.permission_codes

    def has_permission(self, code: str) -> bool:
        return code in self.permissions
