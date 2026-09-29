from __future__ import annotations

from app.application.dto import RoleData
from app.application.use_cases.base import CrudUseCases, UseCase
from app.domain.entities import Permission, Role
from app.domain.exceptions import ConflictError, ValidationError
from app.domain.repositories import Repository
from app.domain.value_objects.pagination import Page, PageRequest


class RoleUseCases(CrudUseCases[Role]):
    entity_label = "Rol"
    not_found_code = "ROLE_NOT_FOUND"

    def _repo(self) -> Repository[Role]:
        return self.uow.roles

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[Role]:
        return self.uow.roles.list(page, search=search, estado=estado)

    def _ensure_unique(self, nombre: str, current_id: int | None = None) -> None:
        existing = self.uow.roles.get_by_nombre(nombre.strip().upper())
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe un rol con ese nombre.", code="ROLE_ALREADY_EXISTS")

    def _resolve_permissions(self, ids: list[int]) -> list[Permission]:
        unique_ids = sorted(set(ids))
        permissions = self.uow.permissions.get_many(unique_ids)
        if len(permissions) != len(unique_ids):
            found = {p.id for p in permissions}
            missing = [i for i in unique_ids if i not in found]
            raise ValidationError("Permisos inexistentes.", code="PERMISSION_NOT_FOUND", details={"ids": missing})
        return permissions

    def create(self, data: RoleData) -> Role:
        with self.uow.transaction():
            role = Role(nombre=data.nombre, descripcion=data.descripcion, estado=data.estado)
            self._ensure_unique(role.nombre)
            if data.permission_ids:
                role.set_permissions(self._resolve_permissions(data.permission_ids))
            self.uow.roles.add(role)
        return role

    def update(self, role_id: int, data: RoleData) -> Role:
        with self.uow.transaction():
            role = self.get(role_id)
            normalized = Role(nombre=data.nombre, descripcion=data.descripcion)
            self._ensure_unique(normalized.nombre, current_id=role.id)
            role.nombre, role.descripcion = normalized.nombre, normalized.descripcion
            role.estado = data.estado
            if data.permission_ids is not None:
                role.set_permissions(self._resolve_permissions(data.permission_ids))
        return role

    def set_permissions(self, role_id: int, permission_ids: list[int]) -> Role:
        with self.uow.transaction():
            role = self.get(role_id)
            role.set_permissions(self._resolve_permissions(permission_ids))
        return role

    def add_permission(self, role_id: int, permission_id: int) -> Role:
        with self.uow.transaction():
            role = self.get(role_id)
            if permission_id not in {p.id for p in role.permissions}:
                role.permissions.append(self._resolve_permissions([permission_id])[0])
        return role

    def remove_permission(self, role_id: int, permission_id: int) -> Role:
        with self.uow.transaction():
            role = self.get(role_id)
            role.set_permissions([p for p in role.permissions if p.id != permission_id])
        return role


class ListPermissionsUseCase(UseCase):
    def execute(self) -> list[Permission]:
        return self.uow.permissions.list_all()
