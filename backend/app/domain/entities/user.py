from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import datetime
from typing import TYPE_CHECKING

from app.domain.entities.base import Activatable, optional_text, require_text
from app.domain.exceptions import ValidationError
from app.domain.value_objects.enums import SYSTEM_ROLES, SystemRole
from app.domain.value_objects.identificacion import normalize_identificacion
from app.domain.value_objects.locations import validate_location

if TYPE_CHECKING:
    from app.domain.entities.branch import Branch

__all__ = ["Permission", "Role", "User", "normalize_celular", "normalize_identificacion"]


def normalize_celular(value: str | None) -> str | None:
    text = re.sub(r"[\s()-]", "", value or "")
    if not text:
        return None
    if not re.fullmatch(r"\+?\d{7,15}", text):
        raise ValidationError(
            "El número de celular no es válido.", code="INVALID_PHONE", details={"field": "celular"}
        )
    return text


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
    def is_system(self) -> bool:
        return self.nombre in SYSTEM_ROLES

    @property
    def permission_codes(self) -> set[str]:
        if not self.estado:
            return set()
        return {p.codigo for p in self.permissions}

    def set_permissions(self, permissions: list[Permission]) -> None:
        self.permissions[:] = permissions


@dataclass(eq=False)
class User(Activatable):
    """A system user. Internal users and clients share this entity; the role defines what it is.

    ``password`` always holds a password *hash*, never plain text. Clients have
    no password and cannot log in. ``foto`` is the relative path of the uploaded photo.
    """

    nombre: str
    apellido: str
    email: str
    rol_id: int | None = None
    password: str | None = None
    identificacion: str | None = None
    celular: str | None = None
    provincia: str | None = None
    ciudad: str | None = None
    foto: str | None = None
    estado: bool = True
    branches: list[Branch] = field(default_factory=list)  # sucursales assigned (sellers)
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        role: Role

    def __post_init__(self) -> None:
        self.nombre = require_text(self.nombre, "nombre", 100)
        self.apellido = require_text(self.apellido, "apellido", 100)
        self.email = require_text(self.email, "email", 255).lower()
        self.identificacion = normalize_identificacion(self.identificacion)
        self.celular = normalize_celular(self.celular)
        self.provincia, self.ciudad = validate_location(self.provincia, self.ciudad)

    @property
    def nombre_completo(self) -> str:
        return f"{self.nombre} {self.apellido}"

    @property
    def role_name(self) -> str | None:
        role = getattr(self, "role", None)
        return role.nombre if role is not None else None

    @property
    def is_technician(self) -> bool:
        return self.role_name == SystemRole.TECNICO.value

    @property
    def is_client(self) -> bool:
        return self.role_name == SystemRole.CLIENTE.value

    @property
    def is_seller(self) -> bool:
        return self.role_name == SystemRole.VENDEDOR.value

    @property
    def branch_ids(self) -> set[int]:
        return {b.id for b in self.branches if b.id is not None}

    def set_branches(self, branches: list[Branch]) -> None:
        self.branches[:] = branches

    @property
    def permissions(self) -> set[str]:
        role = getattr(self, "role", None)
        if not self.estado or role is None:
            return set()
        return role.permission_codes

    def has_permission(self, code: str) -> bool:
        return code in self.permissions
