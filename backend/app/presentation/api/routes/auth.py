from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends
from fastapi.security import OAuth2PasswordRequestForm

from app.application.use_cases.auth import LoginUseCase
from app.presentation.api.dependencies import CurrentUser, HasherDep, TokensDep, UowDep
from app.presentation.api.schemas.users import CurrentUserResponse, LoginRequest, TokenResponse, UserResponse

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(result) -> TokenResponse:
    return TokenResponse(
        access_token=result.access_token,
        token_type=result.token_type,
        expires_at=result.expires_at,
        user=UserResponse.model_validate(result.user),
        permissions=result.permissions,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, uow: UowDep, hasher: HasherDep, tokens: TokensDep) -> TokenResponse:
    return _token_response(LoginUseCase(uow, hasher, tokens).execute(body.email, body.password))


@router.post("/token", include_in_schema=False)
def token(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], uow: UowDep, hasher: HasherDep, tokens: TokensDep
) -> dict:
    """OAuth2 password flow used by the Swagger UI "Authorize" button."""
    result = LoginUseCase(uow, hasher, tokens).execute(form.username, form.password)
    return {"access_token": result.access_token, "token_type": "bearer"}


@router.get("/me", response_model=CurrentUserResponse)
def me(user: CurrentUser) -> CurrentUserResponse:
    return CurrentUserResponse(user=UserResponse.model_validate(user), permissions=sorted(user.permissions))
