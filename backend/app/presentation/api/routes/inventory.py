"""Routes for branches (sucursales), inventory (stock per branch) and locations (provinces / cities)."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status
from fastapi.responses import JSONResponse

from app.application.dto import BranchData, InventoryData, StockAdjustmentData
from app.application.use_cases.inventory import BranchUseCases, InventoryUseCases
from app.domain.entities import User
from app.domain.value_objects.locations import PROVINCES
from app.domain.value_objects.pagination import MAX_PAGE_SIZE, PageRequest
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import CurrentUser, PageDep, UowDep, require_permissions
from app.presentation.api.schemas.common import PageResponse, Schema, StatusUpdateRequest
from app.presentation.api.schemas.inventory import (
    BranchRequest,
    BranchResponse,
    BranchSummary,
    InventoryRequest,
    InventoryResponse,
    StockAdjustmentRequest,
    StockMovementResponse,
)


def _perm(code: str):
    return Annotated[User, Depends(require_permissions(code))]


P_BRANCHES_VIEW = _perm(Perm.BRANCHES_VIEW)
P_BRANCHES_CREATE = _perm(Perm.BRANCHES_CREATE)
P_BRANCHES_UPDATE = _perm(Perm.BRANCHES_UPDATE)
P_BRANCHES_DELETE = _perm(Perm.BRANCHES_DELETE)
P_INVENTORY_VIEW = _perm(Perm.INVENTORY_VIEW)
P_INVENTORY_MANAGE = _perm(Perm.INVENTORY_MANAGE)

# ------------------------------------------------------------- branches
branches = APIRouter(prefix="/branches", tags=["branches"])


@branches.get("", response_model=PageResponse[BranchResponse])
def list_branches(
    uow: UowDep, page: PageDep, _: P_BRANCHES_VIEW, search: str | None = None, estado: bool | None = None
):
    return PageResponse[BranchResponse].from_page(BranchUseCases(uow).list(page, search, estado), BranchResponse)


@branches.get("/{item_id}", response_model=BranchResponse)
def get_branch(item_id: int, uow: UowDep, _: P_BRANCHES_VIEW):
    return BranchResponse.model_validate(BranchUseCases(uow).get(item_id))


@branches.post("", response_model=BranchResponse, status_code=status.HTTP_201_CREATED)
def create_branch(body: BranchRequest, uow: UowDep, _: P_BRANCHES_CREATE):
    return BranchResponse.model_validate(BranchUseCases(uow).create(BranchData(**body.model_dump())))


@branches.put("/{item_id}", response_model=BranchResponse)
def update_branch(item_id: int, body: BranchRequest, uow: UowDep, _: P_BRANCHES_UPDATE):
    return BranchResponse.model_validate(BranchUseCases(uow).update(item_id, BranchData(**body.model_dump())))


@branches.patch("/{item_id}/status", response_model=BranchResponse)
def set_branch_status(item_id: int, body: StatusUpdateRequest, uow: UowDep, _: P_BRANCHES_UPDATE):
    return BranchResponse.model_validate(BranchUseCases(uow).set_status(item_id, body.estado))


@branches.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_branch(item_id: int, uow: UowDep, _: P_BRANCHES_DELETE) -> Response:
    BranchUseCases(uow).delete(item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------ inventory
inventory = APIRouter(prefix="/inventory", tags=["inventory"])


@inventory.get("/branches", response_model=list[BranchSummary])
def inventory_branches(uow: UowDep, _: P_INVENTORY_VIEW):
    """Active branches for inventory / sales filters (does not require ``branches.view``)."""
    result = BranchUseCases(uow).list(PageRequest(1, MAX_PAGE_SIZE), estado=True)
    return [BranchSummary.model_validate(b) for b in result.items]


@inventory.get("", response_model=PageResponse[InventoryResponse])
def list_inventory(
    uow: UowDep,
    page: PageDep,
    _: P_INVENTORY_VIEW,
    search: str | None = None,
    branch_id: int | None = None,
    product_id: int | None = None,
    with_stock: bool | None = None,
    active: bool | None = None,
):
    """Stock per branch. ``search`` matches SKU or product name; ``active`` hides inactive products/branches."""
    result = InventoryUseCases(uow).list(page, search, branch_id, product_id, with_stock, active)
    return PageResponse[InventoryResponse].from_page(result, InventoryResponse)


@inventory.get("/{item_id}", response_model=InventoryResponse)
def get_inventory(item_id: int, uow: UowDep, _: P_INVENTORY_VIEW):
    return InventoryResponse.model_validate(InventoryUseCases(uow).get(item_id))


@inventory.post(
    "",
    response_model=InventoryResponse,
    status_code=status.HTTP_201_CREATED,
    responses={200: {"model": InventoryResponse, "description": "Ya existía: se sumó el stock"}},
)
def create_inventory(body: InventoryRequest, uow: UowDep, actor: P_INVENTORY_MANAGE):
    """Registers a product in a branch with its stock (201). If the product is already in
    the branch, the units are added to the existing stock (200)."""
    item, created = InventoryUseCases(uow).create(InventoryData(**body.model_dump()), actor)
    payload = InventoryResponse.model_validate(item).model_dump(mode="json")
    return JSONResponse(payload, status_code=status.HTTP_201_CREATED if created else status.HTTP_200_OK)


@inventory.patch("/{item_id}/stock", response_model=InventoryResponse)
def adjust_inventory_stock(item_id: int, body: StockAdjustmentRequest, uow: UowDep, actor: P_INVENTORY_MANAGE):
    item = InventoryUseCases(uow).adjust_stock(item_id, StockAdjustmentData(**body.model_dump()), actor)
    return InventoryResponse.model_validate(item)


@inventory.get("/{item_id}/movements", response_model=PageResponse[StockMovementResponse])
def list_inventory_movements(item_id: int, uow: UowDep, page: PageDep, _: P_INVENTORY_VIEW):
    result = InventoryUseCases(uow).movements(item_id, page)
    return PageResponse[StockMovementResponse].from_page(result, StockMovementResponse)


@inventory.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_inventory(item_id: int, uow: UowDep, actor: P_INVENTORY_MANAGE) -> Response:
    """Removes a product from a branch (only with stock 0 and without history)."""
    InventoryUseCases(uow).remove(item_id, actor)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ------------------------------------------------------------ locations
locations = APIRouter(prefix="/locations", tags=["locations"])


class ProvinceResponse(Schema):
    nombre: str
    ciudades: list[str]


@locations.get("/provinces", response_model=list[ProvinceResponse])
def list_provinces(_: CurrentUser):
    """Provinces of Ecuador with their cities (cantons)."""
    return [ProvinceResponse(nombre=name, ciudades=cities) for name, cities in PROVINCES.items()]
