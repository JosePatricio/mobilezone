from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, UploadFile, status
from fastapi.security import OAuth2PasswordRequestForm

from app.application.dto import ProfileData
from app.application.use_cases.auth import ChangePasswordUseCase, LoginUseCase, uses_default_password
from app.application.use_cases.users import UserUseCases
from app.presentation.api.dependencies import CurrentUser, HasherDep, StorageDep, TokensDep, UowDep, read_upload
from app.presentation.api.schemas.users import (
    ChangePasswordRequest,
    CurrentUserResponse,
    LoginRequest,
    ProfileRequest,
    TokenResponse,
    UserResponse,
)

router = APIRouter(prefix="/auth", tags=["auth"])


def _token_response(result) -> TokenResponse:
    return TokenResponse(
        access_token=result.access_token,
        token_type=result.token_type,
        expires_at=result.expires_at,
        user=UserResponse.model_validate(result.user),
        permissions=result.permissions,
        password_por_defecto=result.password_por_defecto,
    )


@router.post("/login", response_model=TokenResponse)
def login(body: LoginRequest, uow: UowDep, hasher: HasherDep, tokens: TokensDep) -> TokenResponse:
    return _token_response(LoginUseCase(uow, hasher, tokens).execute(body.email, body.password, body.remember))


@router.post("/token", include_in_schema=False)
def token(
    form: Annotated[OAuth2PasswordRequestForm, Depends()], uow: UowDep, hasher: HasherDep, tokens: TokensDep
) -> dict:
    """OAuth2 password flow used by the Swagger UI "Authorize" button."""
    result = LoginUseCase(uow, hasher, tokens).execute(form.username, form.password)
    return {"access_token": result.access_token, "token_type": "bearer"}


@router.get("/me", response_model=CurrentUserResponse)
def me(user: CurrentUser, hasher: HasherDep) -> CurrentUserResponse:
    return CurrentUserResponse(
        user=UserResponse.model_validate(user),
        permissions=sorted(user.permissions),
        password_por_defecto=uses_default_password(user, hasher),
    )


@router.post("/change-password", status_code=status.HTTP_204_NO_CONTENT)
def change_password(body: ChangePasswordRequest, user: CurrentUser, uow: UowDep, hasher: HasherDep) -> Response:
    """Mi perfil: the logged user changes their own password (the current one is required)."""
    ChangePasswordUseCase(uow, hasher).execute(user, body.current_password, body.new_password)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/me", response_model=UserResponse)
def update_profile(body: ProfileRequest, user: CurrentUser, uow: UowDep, hasher: HasherDep):
    """Perfil: the logged user updates their own data (role, branches and cédula: administrator)."""
    return UserResponse.model_validate(UserUseCases(uow, hasher).update_profile(user, ProfileData(**body.model_dump())))


@router.put("/me/photo", response_model=UserResponse)
def upload_profile_photo(file: UploadFile, user: CurrentUser, uow: UowDep, hasher: HasherDep, storage: StorageDep):
    content = read_upload(file)
    return UserResponse.model_validate(UserUseCases(uow, hasher, storage).set_photo(user.id, content))  # type: ignore[arg-type]


@router.delete("/me/photo", response_model=UserResponse)
def delete_profile_photo(user: CurrentUser, uow: UowDep, hasher: HasherDep, storage: StorageDep):
    return UserResponse.model_validate(UserUseCases(uow, hasher, storage).set_photo(user.id, None))  # type: ignore[arg-type]
