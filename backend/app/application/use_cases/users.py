from __future__ import annotations

from app.application.dto import ClientData, UserData
from app.application.services.files import FileStorage
from app.application.services.security import PasswordHasher
from app.application.use_cases.base import CrudUseCases
from app.application.use_cases.images import replace_image
from app.domain.entities import Branch, Role, User
from app.domain.exceptions import ConflictError, NotFoundError, ValidationError
from app.domain.repositories import Repository, UnitOfWork
from app.domain.value_objects.enums import SystemRole
from app.domain.value_objects.identificacion import normalize_identificacion
from app.domain.value_objects.pagination import Page, PageRequest

MIN_PASSWORD_LENGTH = 8
USER_PHOTOS_FOLDER = "users"


def _validate_password(password: str) -> str:
    if len(password) < MIN_PASSWORD_LENGTH:
        raise ValidationError(
            f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres.", code="WEAK_PASSWORD"
        )
    return password


class _UserValidation(CrudUseCases[User]):
    def _repo(self) -> Repository[User]:
        return self.uow.users

    def _ensure_unique(self, email: str | None, identificacion: str | None, current_id: int | None = None) -> None:
        existing = self.uow.users.get_by_email(email.strip().lower()) if email else None
        if existing is not None and existing.id != current_id:
            raise ConflictError(
                "Ya existe un usuario con ese email.", code="EMAIL_ALREADY_EXISTS", details={"field": "email"}
            )
        if identificacion:
            for existing in self.uow.users.find_same_person(identificacion):
                if existing.id == current_id:
                    continue
                same = existing.identificacion == identificacion
                raise ConflictError(
                    "Ya existe un usuario con esa cédula / RUC."
                    if same
                    else f"La cédula / RUC corresponde a la misma persona que {existing.nombre_completo} "
                    f"({existing.identificacion}).",
                    code="IDENTIFICATION_ALREADY_EXISTS",
                    details={"field": "identificacion"},
                )

    def _role_by_name(self, name: SystemRole) -> Role:
        role = self.uow.roles.get_by_nombre(name.value)
        if role is None:  # pragma: no cover - created by the seed
            raise NotFoundError(f"El rol {name.value} no existe. Ejecute el seed.", code="ROLE_NOT_FOUND")
        return role


class UserUseCases(_UserValidation):
    entity_label = "Usuario"
    not_found_code = "USER_NOT_FOUND"

    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher, storage: FileStorage | None = None) -> None:
        super().__init__(uow)
        self.hasher = hasher
        self.storage = storage

    def list(
        self,
        page: PageRequest,
        search: str | None = None,
        estado: bool | None = None,
        rol_id: int | None = None,
        roles: list[str] | None = None,
    ) -> Page[User]:
        return self.uow.users.list(page, search=search, roles=roles, estado=estado, rol_id=rol_id)

    def _get_role(self, rol_id: int) -> Role:
        role = self.uow.roles.get(rol_id)
        if role is None:
            raise NotFoundError("Rol no encontrado.", code="ROLE_NOT_FOUND")
        if not role.estado:
            raise ValidationError("El rol seleccionado está inactivo.", code="ROLE_INACTIVE")
        return role

    def _build(self, data: UserData) -> User:
        """Validates and normalizes the fields through the entity rules."""
        return User(
            nombre=data.nombre,
            apellido=data.apellido,
            email=data.email,
            rol_id=data.rol_id,
            identificacion=data.identificacion,
            celular=data.celular,
            provincia=data.provincia,
            ciudad=data.ciudad,
            estado=data.estado,
        )

    def _resolve_branches(self, role: Role, branch_ids: list[int] | None) -> list[Branch]:
        """Sellers must be assigned to at least one active branch; clients never have branches."""
        if role.nombre == SystemRole.CLIENTE.value:
            return []
        ids = sorted(set(branch_ids or []))
        branches = self.uow.branches.get_many(ids)
        if len(branches) != len(ids):
            raise ValidationError("Sucursal no encontrada.", code="BRANCH_NOT_FOUND", details={"field": "branch_ids"})
        if role.nombre == SystemRole.VENDEDOR.value and not any(b.estado for b in branches):
            raise ValidationError(
                "Asigne al menos una sucursal activa al vendedor.",
                code="BRANCH_REQUIRED",
                details={"field": "branch_ids"},
            )
        return branches

    def create(self, data: UserData) -> User:
        with self.uow.transaction():
            role = self._get_role(data.rol_id)
            user = self._build(data)
            self._ensure_unique(user.email, user.identificacion)
            user.set_branches(self._resolve_branches(role, data.branch_ids))
            # Clients never log in (no password, email optional); every other role needs both.
            if role.nombre != SystemRole.CLIENTE.value:
                self._require_email(user)
                password = data.password or self._default_password(role, user)
                user.password = self.hasher.hash(_validate_password(password))
            self.uow.users.add(user)
        return user

    @staticmethod
    def _require_email(user: User) -> None:
        if not user.email:
            raise ValidationError(
                "El email es obligatorio: es el usuario para iniciar sesión.",
                code="REQUIRED_FIELD",
                details={"field": "email"},
            )

    @staticmethod
    def _default_password(role: Role, user: User) -> str:
        """Sellers without an explicit password get their cédula / RUC as initial password."""
        if role.nombre == SystemRole.VENDEDOR.value:
            if not user.identificacion:
                raise ValidationError(
                    "Ingrese la cédula / RUC del vendedor: será su contraseña inicial.",
                    code="IDENTIFICATION_REQUIRED",
                    details={"field": "identificacion"},
                )
            return user.identificacion
        raise ValidationError(
            "La contraseña es obligatoria.", code="PASSWORD_REQUIRED", details={"field": "password"}
        )

    def update(self, user_id: int, data: UserData, actor: User) -> User:
        with self.uow.transaction():
            user = self.get(user_id)
            role = self._get_role(data.rol_id) if data.rol_id != user.rol_id else user.role
            changes = self._build(data)
            self._ensure_unique(changes.email, changes.identificacion, current_id=user.id)
            if user.id == actor.id and not data.estado:
                raise ValidationError("No puede desactivar su propio usuario.", code="CANNOT_DEACTIVATE_SELF")
            if user.id == actor.id and data.rol_id != user.rol_id:
                raise ValidationError("No puede cambiar su propio rol.", code="CANNOT_CHANGE_OWN_ROLE")
            attrs = ("nombre", "apellido", "email", "identificacion", "celular", "provincia", "ciudad", "estado", "rol_id")
            for attr in attrs:
                setattr(user, attr, getattr(changes, attr))
            user.set_branches(self._resolve_branches(role, data.branch_ids))
            if role.nombre == SystemRole.CLIENTE.value:
                user.password = None
                return user
            self._require_email(user)
            if data.password:
                user.password = self.hasher.hash(_validate_password(data.password))
            elif not user.password:  # e.g. a client promoted to seller
                user.password = self.hasher.hash(_validate_password(self._default_password(role, user)))
        return user

    def set_user_status(self, user_id: int, estado: bool, actor: User) -> User:
        if user_id == actor.id and not estado:
            raise ValidationError("No puede desactivar su propio usuario.", code="CANNOT_DEACTIVATE_SELF")
        return self.set_status(user_id, estado)

    def set_photo(self, user_id: int, content: bytes | None) -> User:
        assert self.storage is not None
        return replace_image(self.uow, self.storage, lambda: self.get(user_id), "foto", USER_PHOTOS_FOLDER, content)


class ClientUseCases(_UserValidation):
    """Clients are users with the CLIENTE role (same ``users`` table)."""

    entity_label = "Cliente"
    not_found_code = "CLIENT_NOT_FOUND"

    def __init__(self, uow: UnitOfWork, storage: FileStorage | None = None) -> None:
        super().__init__(uow)
        self.storage = storage

    def get(self, entity_id: int) -> User:
        user = super().get(entity_id)
        if not user.is_client:
            raise NotFoundError("Cliente no encontrado.", code=self.not_found_code)
        return user

    def list(self, page: PageRequest, search: str | None = None, estado: bool | None = None) -> Page[User]:
        return self.uow.users.list(page, search=search, roles=[SystemRole.CLIENTE.value], estado=estado)

    def find_by_identificacion(self, identificacion: str) -> User:
        """Looks up an active client by cédula / RUC (used by the sales screen)."""
        value = normalize_identificacion(identificacion)
        user = self.uow.users.get_by_identificacion(value) if value else None
        if user is None or not user.is_client:
            raise NotFoundError(
                "No se encontró ningún cliente con esa cédula / RUC.", code=self.not_found_code
            )
        if not user.estado:
            raise ValidationError("El cliente se encuentra inactivo.", code="CLIENT_INACTIVE")
        return user

    def _build(self, data: ClientData, rol_id: int) -> User:
        if not (data.identificacion or "").strip():
            raise ValidationError(
                "La cédula / RUC del cliente es obligatoria.",
                code="REQUIRED_FIELD",
                details={"field": "identificacion"},
            )
        return User(
            nombre=data.nombre,
            apellido=data.apellido,
            email=data.email,
            rol_id=rol_id,
            identificacion=data.identificacion,
            celular=data.celular,
            provincia=data.provincia,
            ciudad=data.ciudad,
            estado=data.estado,
        )

    def create(self, data: ClientData) -> User:
        with self.uow.transaction():
            client = self._build(data, self._role_by_name(SystemRole.CLIENTE).id)  # type: ignore[arg-type]
            self._ensure_unique(client.email, client.identificacion)
            self.uow.users.add(client)
        return client

    def update(self, client_id: int, data: ClientData) -> User:
        with self.uow.transaction():
            client = self.get(client_id)
            changes = self._build(data, client.rol_id)  # type: ignore[arg-type]
            self._ensure_unique(changes.email, changes.identificacion, current_id=client.id)
            for attr in ("nombre", "apellido", "email", "identificacion", "celular", "provincia", "ciudad", "estado"):
                setattr(client, attr, getattr(changes, attr))
        return client

    def set_photo(self, client_id: int, content: bytes | None) -> User:
        assert self.storage is not None
        return replace_image(
            self.uow, self.storage, lambda: self.get(client_id), "foto", USER_PHOTOS_FOLDER, content
        )
