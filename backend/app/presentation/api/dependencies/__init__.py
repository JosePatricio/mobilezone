"""FastAPI dependencies: composition root wiring infrastructure into use cases."""
from __future__ import annotations

from typing import Annotated, Callable, Iterator

from fastapi import Depends, Query, Request
from fastapi.security import OAuth2PasswordBearer

from app.application.services.security import PasswordHasher, TokenService
from app.application.use_cases.auth import GetAuthenticatedUserUseCase
from app.application.use_cases.base import require_permission
from app.domain.entities import User
from app.domain.exceptions import AuthenticationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.pagination import MAX_PAGE_SIZE, PageRequest
from app.infrastructure.database.unit_of_work import SqlAlchemyUnitOfWork

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/v1/auth/token", auto_error=False)


def get_uow(request: Request) -> Iterator[UnitOfWork]:
    """One Unit of Work (session) per request, closed once the request ends."""
    session = request.app.state.session_factory()
    try:
        yield SqlAlchemyUnitOfWork(session)
    finally:
        session.close()


def get_password_hasher(request: Request) -> PasswordHasher:
    return request.app.state.password_hasher


def get_token_service(request: Request) -> TokenService:
    return request.app.state.token_service


UowDep = Annotated[UnitOfWork, Depends(get_uow)]
HasherDep = Annotated[PasswordHasher, Depends(get_password_hasher)]
TokensDep = Annotated[TokenService, Depends(get_token_service)]


def get_current_user(
    uow: UowDep,
    tokens: TokensDep,
    token: Annotated[str | None, Depends(oauth2_scheme)],
) -> User:
    if not token:
        raise AuthenticationError("No autenticado.", code="NOT_AUTHENTICATED")
    return GetAuthenticatedUserUseCase(uow, tokens).execute(token)


CurrentUser = Annotated[User, Depends(get_current_user)]


def require_permissions(*codes: str) -> Callable[..., User]:
    """Endpoint-level authorization: the user must hold every listed permission."""

    def dependency(user: CurrentUser) -> User:
        for code in codes:
            require_permission(user, code)
        return user

    return dependency


def get_page(
    page: Annotated[int, Query(ge=1)] = 1,
    size: Annotated[int, Query(ge=1, le=MAX_PAGE_SIZE)] = 20,
) -> PageRequest:
    return PageRequest(page=page, size=size)


PageDep = Annotated[PageRequest, Depends(get_page)]
