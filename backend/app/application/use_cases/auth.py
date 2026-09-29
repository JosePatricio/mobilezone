from __future__ import annotations

from app.application.dto import LoginResult
from app.application.services.security import PasswordHasher, TokenService
from app.application.use_cases.base import UseCase
from app.domain.entities import User
from app.domain.exceptions import AuthenticationError
from app.domain.repositories import UnitOfWork

INVALID_CREDENTIALS = "Credenciales inválidas."


class LoginUseCase(UseCase):
    def __init__(self, uow: UnitOfWork, hasher: PasswordHasher, tokens: TokenService) -> None:
        super().__init__(uow)
        self.hasher = hasher
        self.tokens = tokens

    def execute(self, email: str, password: str) -> LoginResult:
        user = self.uow.users.get_by_email(email.strip().lower())
        # Clients without password cannot log in (pending definition, spec §25.7).
        if user is None or not user.password:
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        if not self.hasher.verify(password, user.password):
            raise AuthenticationError(INVALID_CREDENTIALS, code="INVALID_CREDENTIALS")
        if not user.estado:
            raise AuthenticationError("El usuario se encuentra inactivo.", code="USER_INACTIVE")
        token = self.tokens.create_access_token(user.id)  # type: ignore[arg-type]
        return LoginResult(
            access_token=token.token,
            expires_at=token.expires_at,
            user=user,
            permissions=sorted(user.permissions),
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
