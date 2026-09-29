from __future__ import annotations

from app.application.dto import ClientData, CreateUserData, UpdateUserData
from app.application.services.security import PasswordHasher
from app.application.use_cases.base import CrudUseCases
from app.domain.entities import User
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import Repository, UnitOfWork
from app.domain.value_objects.enums import UserType
from app.domain.value_objects.pagination import Page, PageRequest

MIN_PASSWORD_LENGTH = 8


def _validate_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.", code="WEAK_PASSWORD"
        )
    return password


class UserUseCases(CrudUseCases[User]):
    entity_label = "Usuario"
    not_found_code = "USER_NOT_FOUND"

    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher) -> None:
        super().__init__(uow)
        self.hasher = hasher

    def _repo(self) -> Repository[User]:
        return self.uow.users

    def list(
        self,
        page: PageRequest,
        search: str | None = None,
        tipo_usuario: UserType | None = None,
        estado: bool | None = None,
        rol_id: int | None = None,
    ) -> Page[User]:
        tipos = [tipo_usuario] if tipo_usuario else None
        return self.uow.users.list(page, search=search, tipo_usuario=tipos, estado=estado, rol_id=rol_id)

    def _ensure_unique_email(self, email: str, current_id: int | None = None) -> None:
        existing = self.uow.users.get_by_email(email.strip().lower())
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe un usuario con ese email.", code="EMAIL_ALREADY_EXISTS")

    def _validate_role(self, rol_id: int | None) -> None:
        if rol_id is None:
            return
        role = self.uow.roles.get(rol_id)
        if role is None:
            raise NotFoundError("Rol no encontrado.", code="ROLE_NOT_FOUND")
        if not role.estado:
            raise ValidationError("El rol seleccionado está inactivo.", code="ROLE_INACTIVE")

    def create(self, data: CreateUserData) -> User:
        tipo = UserType(data.tipo_usuario)
        if tipo != UserType.CLIENTE and not data.password:
            raise ValidationError("La contraseña es obligatoria.", code="PASSWORD_REQUIRED")
        with self.uow.transaction():
            self._ensure_unique_email(data.email)
            self._validate_role(data.rol_id)
            user = User(
                nombre=data.nombre,
                apellido=data.apellido,
                email=data.email,
                tipo_usuario=tipo,
                password=self.hasher.hash(_validate_password(data.password)) if data.password else None,
                rol_id=data.rol_id,
                estado=data.estado,
            )
            self.uow.users.add(user)
        return user

    def update(self, user_id: int, data: UpdateUserData, actor: User) -> User:
        with self.uow.transaction():
            user = self.get(user_id)
            self._ensure_unique_email(data.email, current_id=user.id)
            self._validate_role(data.rol_id)
            if user.id == actor.id and not data.estado:
                raise ValidationError("No puede desactivar su propio usuario.", code="CANNOT_DEACTIVATE_SELF")
            changes = User(
                nombre=data.nombre,
                apellido=data.apellido,
                email=data.email,
                tipo_usuario=data.tipo_usuario,
            )
            user.nombre, user.apellido, user.email = changes.nombre, changes.apellido, changes.email
            user.tipo_usuario = changes.tipo_usuario
            user.rol_id = data.rol_id
            user.estado = data.estado
            if data.password:
                user.password = self.hasher.hash(_validate_password(data.password))
        return user

    def set_user_status(self, user_id: int, estado: bool, actor: User) -> User:
        if user_id == actor.id and not estado:
            raise ValidationError("No puede desactivar su propio usuario.", code="CANNOT_DEACTIVATE_SELF")
        return self.set_status(user_id, estado)


class ClientUseCases(CrudUseCases[User]):
    """Clients are users of type CLIENTE (same ``users`` table)."""

    entity_label = "Cliente"
    not_found_code = "CLIENT_NOT_FOUND"

    def _repo(self) -> Repository[User]:
        return self.uow.users

    def get(self, entity_id: int) -> User:
        user = super().get(entity_id)
        if not user.is_client:
            raise NotFoundError("Cliente no encontrado.", code=self.not_found_code)
        return user

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[User]:
        return self.uow.users.list(page, search=search, tipo_usuario=[UserType.CLIENTE], estado=estado)

    def _ensure_unique_email(self, email: str, current_id: int | None = None) -> None:
        existing = self.uow.users.get_by_email(email.strip().lower())
        if existing is not None and existing.id != current_id:
            raise ConflictError("Ya existe un usuario con ese email.", code="EMAIL_ALREADY_EXISTS")

    def create(self, data: ClientData) -> User:
        with self.uow.transaction():
            self._ensure_unique_email(data.email)
            client = User(
                nombre=data.nombre,
                apellido=data.apellido,
                email=data.email,
                tipo_usuario=UserType.CLIENTE,
                estado=data.estado,
            )
            self.uow.users.add(client)
        return client

    def update(self, client_id: int, data: ClientData) -> User:
        with self.uow.transaction():
            client = self.get(client_id)
            self._ensure_unique_email(data.email, current_id=client.id)
            normalized = User(nombre=data.nombre, apellido=data.apellido, email=data.email, tipo_usuario=UserType.CLIENTE)
            client.nombre, client.apellido, client.email = normalized.nombre, normalized.apellido, normalized.email
            client.estado = data.estado
        return client
