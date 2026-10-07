from __future__ import annotations

from app.application.dto import LoginResult
from app.application.services.security import PasswordHasher, TokenService
from app.application.use_cases.base import UseCase
from app.application.use_cases.users import validate_password
from app.domain.entities import User
from app.domain.exceptions import AuthenticationError, ValidationError
from app.domain.repositories import UnitOfWork

INVALID_CREDENTIALS = "Credenciales inválidas."


def uses_default_password(user: User, hasher: PasswordHasher) -> bool:
    """True while the password is still the cédula / RUC (initial password): the app suggests changing it."""
    return bool(user.identificacion and user.password and hasher.verify(user.identificacion, user.password))


class LoginUseCase(UseCase):
    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher, tokens: TokenService) -> None:
        super().__init__(uow)
        self.hasher = hasher
        self.tokens = tokens

    def execute(self, email: str, password: str, remember: bool = False) -> LoginResult:
        user = self.uow.users.get_by_email(email.strip().lower())
        # Clients without password cannot log in (pending definition, spec §25.7).
        if user is None or not user.password:
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        if not self.hasher.verify(password, user.password):
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        if not user.estado:
            raise AuthenticationError("El usuario se encuentra inactivo.", code="USER_INACTIVE")
        token = self.tokens.create_access_token(user.id, remember)  # type: ignore[arg-type]
        return LoginResult(
            access_token=token.token,
            expires_at=token.expires_at,
            user=user,
            permissions=sorted(user.permissions),
            password_por_defecto=bool(user.identificacion) and password == user.identificacion,
        )


class GetAuthenticatedUserUseCase(UseCase):
    def __init__(self, uow: UnitOfWork, tokens: TokenService) -> None:
        super().__init__(uow)
        self.tokens = tokens

    def execute(self, token: str) -> User:
        user_id = self.tokens.decode_user_id(token)
        user = self.uow.users.get(user_id)
        if user is None or not user.estado:
            raise AuthenticationError("Sesión inválida o usuario inactivo.", code="INVALID_TOKEN")
        return user


class ChangePasswordUseCase(UseCase):
    """The logged user changes their own password (Mi perfil). The current password is required."""

    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher) -> None:
        super().__init__(uow)
        self.hasher = hasher

    def execute(self, actor: User, current_password: str, new_password: str) -> None:
        with self.uow.transaction():
            user = self.uow.users.get(actor.id)  # type: ignore[arg-type]
            if user is None or not user.password or not self.hasher.verify(current_password, user.password):
                # 400, not 401: a wrong current password must not end the session.
                raise ValidationError(
                    "La contraseña actual es incorrecta.",
                    code="INVALID_CURRENT_PASSWORD",
                    details={"field": "current_password"},
                )
            if new_password == current_password:
                raise ValidationError(
                    "La nueva contraseña debe ser distinta de la actual.",
                    code="SAME_PASSWORD",
                    details={"field": "new_password"},
                )
            try:
                validate_password(new_password)
            except ValidationError as exc:
                raise ValidationError(exc.message, code=exc.code, details={"field": "new_password"}) from exc
            user.password = self.hasher.hash(new_password)
