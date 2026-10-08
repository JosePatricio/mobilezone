from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal
from typing import Annotated

from pydantic import BeforeValidator, EmailStr, Field, StringConstraints, computed_field

from app.domain.value_objects.enums import WORK_ORDER_STATUS_LABELS, WorkOrderStatus
from app.domain.value_objects.identificacion import IDENTIFICACION_MAX_LENGTH, IDENTIFICACION_VALIDATION_ENABLED
from app.presentation.api.schemas.common import Name, RequestSchema, Schema, media_url

Identificacion = Annotated[
    str,
    StringConstraints(strip_whitespace=True, pattern=r"^\d{10}(\d{3})?$")
    if IDENTIFICACION_VALIDATION_ENABLED
    # Temporarily any value (legacy users without cédula); spaces / dashes are removed by the domain.
    else StringConstraints(strip_whitespace=True, min_length=1, max_length=IDENTIFICACION_MAX_LENGTH + 5),
    Field(description="Cédula (10) o RUC (13), validados con el algoritmo ecuatoriano"),
]
# Empty string from a form = no email (clients do not need one).
OptionalEmail = Annotated[
    EmailStr | None, BeforeValidator(lambda v: None if isinstance(v, str) and not v.strip() else v)
]
Celular = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=20)]
Provincia = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)]
Ciudad = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=100)]
Direccion = Annotated[str | None, StringConstraints(strip_whitespace=True, max_length=255)]


class BranchRef(Schema):
    id: int
    nombre: str


class LoginRequest(RequestSchema):
    email: str = Field(min_length=3, max_length=255)
    password: str = Field(min_length=1, max_length=128)
    remember: bool = Field(default=False, description="Mantener la sesión iniciada (sesión más larga)")


class ChangePasswordRequest(RequestSchema):
    current_password: str = Field(min_length=1, max_length=128)
    new_password: str = Field(min_length=1, max_length=128, description="Mínimo 8 caracteres")


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
    email: str | None


class UserResponse(_WithPhoto):
    """Never includes the password hash. The role defines the kind of user."""

    id: int
    nombre: str
    apellido: str
    email: str | None
    identificacion: str | None
    celular: str | None
    provincia: str | None
    ciudad: str | None
    direccion: str | None
    rol_id: int
    role: RoleSummary
    branches: list[BranchRef] = Field(description="Sucursales asignadas")
    estado: bool
    created_at: datetime
    updated_at: datetime


class CurrentUserResponse(Schema):
    user: UserResponse
    permissions: list[str]
    password_por_defecto: bool = Field(default=False, description="La contraseña sigue siendo la cédula / RUC: se sugiere cambiarla")


class TokenResponse(Schema):
    access_token: str
    token_type: str = "bearer"
    expires_at: datetime
    user: UserResponse
    permissions: list[str]
    password_por_defecto: bool = Field(default=False, description="La contraseña sigue siendo la cédula / RUC: se sugiere cambiarla")


class UserRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: OptionalEmail = Field(default=None, description="Obligatorio salvo para el rol CLIENTE")
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
    direccion: Direccion = Field(default=None, description="Dirección (se muestra en los repuestos de afiliados)")
    estado: bool = True
    branch_ids: list[int] = Field(default_factory=list, description="Sucursales (obligatorio para VENDEDOR)")


class ProfileRequest(RequestSchema):
    """Own data of the logged user (Perfil)."""

    nombre: Name
    apellido: Name
    email: EmailStr
    celular: Celular = None
    provincia: Provincia = None
    ciudad: Ciudad = None
    direccion: Direccion = None


class ClientRequest(RequestSchema):
    nombre: Name
    apellido: Name
    email: OptionalEmail = None
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
    email: str | None = None


class ClientResponse(_WithPhoto):
    id: int
    nombre: str
    apellido: str
    email: str | None
    identificacion: str | None
    celular: str | None
    provincia: str | None
    ciudad: str | None
    estado: bool
    created_at: datetime
    updated_at: datetime


class UserSaleUsage(Schema):
    id: int
    fecha: datetime
    total_pagar: Decimal
    estado: str
    rol: str = Field(description="Vendedor | Cliente")


class UserOrderUsage(Schema):
    id: int
    num_orden: int | None
    fecha: date
    estado: int
    rol: str = Field(description="Registró | Cliente | Técnico")

    @computed_field  # type: ignore[prop-decorator]
    @property
    def estado_label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[WorkOrderStatus(self.estado)]


class UserUsageResponse(Schema):
    """What references the user: shown in the confirmation before deleting it."""

    ventas: list[UserSaleUsage]
    ventas_total: int
    ordenes: list[UserOrderUsage]
    ordenes_total: int
    otros_total: int = Field(
        description="Historial de estados, repuestos de órdenes, movimientos de stock y repuestos de afiliados"
    )
    has_records: bool
