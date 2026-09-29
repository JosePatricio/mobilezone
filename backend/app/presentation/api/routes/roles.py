from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.application.dto import RoleData
from app.application.use_cases.roles import ListPermissionsUseCase, RoleUseCases
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import PageDep, UowDep, require_permissions
from app.presentation.api.schemas.common import PageResponse, StatusUpdateRequest
from app.presentation.api.schemas.roles import PermissionResponse, RolePermissionsRequest, RoleRequest, RoleResponse

router = APIRouter(prefix="/roles", tags=["roles"])
permissions_router = APIRouter(prefix="/permissions", tags=["permissions"])

CanView = Annotated[User, Depends(require_permissions(Perm.ROLES_VIEW))]
CanManage = Annotated[User, Depends(require_permissions(Perm.ROLES_MANAGE))]


@router.get("", response_model=PageResponse[RoleResponse])
def list_roles(uow: UowDep, page: PageDep, _: CanView, search: str | None = None, estado: bool | None = None):
    return PageResponse[RoleResponse].from_page(RoleUseCases(uow).list(page, search, estado), RoleResponse)


@router.get("/{role_id}", response_model=RoleResponse)
def get_role(role_id: int, uow: UowDep, _: CanView):
    return RoleResponse.model_validate(RoleUseCases(uow).get(role_id))


@router.post("", response_model=RoleResponse, status_code=status.HTTP_201_CREATED)
def create_role(body: RoleRequest, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).create(RoleData(**body.model_dump())))


@router.put("/{role_id}", response_model=RoleResponse)
def update_role(role_id: int, body: RoleRequest, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).update(role_id, RoleData(**body.model_dump())))


@router.patch("/{role_id}/status", response_model=RoleResponse)
def set_role_status(role_id: int, body: StatusUpdateRequest, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).set_status(role_id, body.estado))


@router.put("/{role_id}/permissions", response_model=RoleResponse)
def set_role_permissions(role_id: int, body: RolePermissionsRequest, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).set_permissions(role_id, body.permission_ids))


@router.post("/{role_id}/permissions/{permission_id}", response_model=RoleResponse)
def add_role_permission(role_id: int, permission_id: int, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).add_permission(role_id, permission_id))


@router.delete("/{role_id}/permissions/{permission_id}", response_model=RoleResponse)
def remove_role_permission(role_id: int, permission_id: int, uow: UowDep, _: CanManage):
    return RoleResponse.model_validate(RoleUseCases(uow).remove_permission(role_id, permission_id))


@router.delete("/{role_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_role(role_id: int, uow: UowDep, _: CanManage) -> Response:
    RoleUseCases(uow).delete(role_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@permissions_router.get("", response_model=list[PermissionResponse])
def list_permissions(uow: UowDep, _: Annotated[User, Depends(require_permissions(Perm.PERMISSIONS_VIEW))]):
    return [PermissionResponse.model_validate(p) for p in ListPermissionsUseCase(uow).execute()]
