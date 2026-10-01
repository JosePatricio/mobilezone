from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, UploadFile, status

from app.application.dto import ClientData, UserData
from app.application.use_cases.users import ClientUseCases, UserUseCases
from app.domain.entities import User
from app.domain.value_objects.enums import SystemRole
from app.domain.value_objects.pagination import MAX_PAGE_SIZE, PageRequest
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import (
    HasherDep,
    PageDep,
    StorageDep,
    UowDep,
    read_upload,
    require_permissions,
)
from app.presentation.api.schemas.common import PageResponse, StatusUpdateRequest
from app.presentation.api.schemas.users import (
    ClientRequest,
    ClientResponse,
    UserRequest,
    UserResponse,
    UserSummary,
)

router = APIRouter(prefix="/users", tags=["users"])
clients_router = APIRouter(prefix="/clients", tags=["clients"])

CanViewUsers = Annotated[User, Depends(require_permissions(Perm.USERS_VIEW))]
CanUpdateUsers = Annotated[User, Depends(require_permissions(Perm.USERS_UPDATE))]
CanViewClients = Annotated[User, Depends(require_permissions(Perm.CLIENTS_VIEW))]
CanUpdateClients = Annotated[User, Depends(require_permissions(Perm.CLIENTS_UPDATE))]


@router.get("", response_model=PageResponse[UserResponse])
def list_users(
    uow: UowDep,
    hasher: HasherDep,
    page: PageDep,
    _: CanViewUsers,
    search: str | None = None,
    estado: bool | None = None,
    rol_id: int | None = None,
):
    result = UserUseCases(uow, hasher).list(page, search, estado, rol_id)
    return PageResponse[UserResponse].from_page(result, UserResponse)


@router.get("/technicians", response_model=list[UserSummary])
def list_technicians(
    uow: UowDep,
    hasher: HasherDep,
    _: Annotated[User, Depends(require_permissions(Perm.WORK_ORDERS_VIEW))],
    search: str | None = None,
):
    """Active staff (every role except CLIENTE) for the "Técnico" filter of work orders:
    the technician of an order is the user who registered it."""
    staff = [r.nombre for r in uow.roles.list(PageRequest(1, MAX_PAGE_SIZE)).items if r.nombre != SystemRole.CLIENTE.value]
    result = UserUseCases(uow, hasher).list(PageRequest(1, MAX_PAGE_SIZE), search, estado=True, roles=staff)
    return [UserSummary.model_validate(u) for u in result.items]


@router.get("/{user_id}", response_model=UserResponse)
def get_user(user_id: int, uow: UowDep, hasher: HasherDep, _: CanViewUsers):
    return UserResponse.model_validate(UserUseCases(uow, hasher).get(user_id))


@router.post("", response_model=UserResponse, status_code=status.HTTP_201_CREATED)
def create_user(
    body: UserRequest,
    uow: UowDep,
    hasher: HasherDep,
    _: Annotated[User, Depends(require_permissions(Perm.USERS_CREATE))],
):
    user = UserUseCases(uow, hasher).create(UserData(**body.model_dump()))
    return UserResponse.model_validate(user)


@router.put("/{user_id}", response_model=UserResponse)
def update_user(user_id: int, body: UserRequest, uow: UowDep, hasher: HasherDep, actor: CanUpdateUsers):
    user = UserUseCases(uow, hasher).update(user_id, UserData(**body.model_dump()), actor)
    return UserResponse.model_validate(user)


@router.patch("/{user_id}/status", response_model=UserResponse)
def set_user_status(user_id: int, body: StatusUpdateRequest, uow: UowDep, hasher: HasherDep, actor: CanUpdateUsers):
    return UserResponse.model_validate(UserUseCases(uow, hasher).set_user_status(user_id, body.estado, actor))


@router.put("/{user_id}/photo", response_model=UserResponse)
def upload_user_photo(
    user_id: int, file: UploadFile, uow: UowDep, hasher: HasherDep, storage: StorageDep, _: CanUpdateUsers
):
    """Uploads the user photo (JPG, PNG or WEBP, max 2 MB). Without a photo the client shows an avatar."""
    content = read_upload(file)
    return UserResponse.model_validate(UserUseCases(uow, hasher, storage).set_photo(user_id, content))


@router.delete("/{user_id}/photo", response_model=UserResponse)
def delete_user_photo(user_id: int, uow: UowDep, hasher: HasherDep, storage: StorageDep, _: CanUpdateUsers):
    return UserResponse.model_validate(UserUseCases(uow, hasher, storage).set_photo(user_id, None))


# ---------------------------------------------------------------- clients


@clients_router.get("", response_model=PageResponse[ClientResponse])
def list_clients(
    uow: UowDep, page: PageDep, _: CanViewClients, search: str | None = None, estado: bool | None = None
):
    return PageResponse[ClientResponse].from_page(ClientUseCases(uow).list(page, search, estado), ClientResponse)


@clients_router.get("/{client_id}", response_model=ClientResponse)
def get_client(client_id: int, uow: UowDep, _: CanViewClients):
    return ClientResponse.model_validate(ClientUseCases(uow).get(client_id))


@clients_router.post("", response_model=ClientResponse, status_code=status.HTTP_201_CREATED)
def create_client(
    body: ClientRequest, uow: UowDep, _: Annotated[User, Depends(require_permissions(Perm.CLIENTS_CREATE))]
):
    return ClientResponse.model_validate(ClientUseCases(uow).create(ClientData(**body.model_dump())))


@clients_router.put("/{client_id}", response_model=ClientResponse)
def update_client(client_id: int, body: ClientRequest, uow: UowDep, _: CanUpdateClients):
    return ClientResponse.model_validate(ClientUseCases(uow).update(client_id, ClientData(**body.model_dump())))


@clients_router.patch("/{client_id}/status", response_model=ClientResponse)
def set_client_status(client_id: int, body: StatusUpdateRequest, uow: UowDep, _: CanUpdateClients):
    use_cases = ClientUseCases(uow)
    use_cases.get(client_id)  # ensures it is a client
    return ClientResponse.model_validate(use_cases.set_status(client_id, body.estado))


@clients_router.put("/{client_id}/photo", response_model=ClientResponse)
def upload_client_photo(client_id: int, file: UploadFile, uow: UowDep, storage: StorageDep, _: CanUpdateClients):
    content = read_upload(file)
    return ClientResponse.model_validate(ClientUseCases(uow, storage).set_photo(client_id, content))


@clients_router.delete("/{client_id}/photo", response_model=ClientResponse)
def delete_client_photo(client_id: int, uow: UowDep, storage: StorageDep, _: CanUpdateClients):
    return ClientResponse.model_validate(ClientUseCases(uow, storage).set_photo(client_id, None))
