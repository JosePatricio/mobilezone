"""Routes for categories, brands, models and spare parts."""
from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, status

from app.application.dto import CatalogData, DeviceModelData, SparePartData
from app.application.use_cases.catalog import BrandUseCases, CategoryUseCases, DeviceModelUseCases, SparePartUseCases
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import PageDep, UowDep, require_permissions
from app.presentation.api.schemas.catalog import (
    BrandResponse,
    CatalogRequest,
    CategoryResponse,
    DeviceModelRequest,
    DeviceModelResponse,
    SparePartRequest,
    SparePartResponse,
)
from app.presentation.api.schemas.common import PageResponse, StatusUpdateRequest


def _perm(code: str):
    return Annotated[User, Depends(require_permissions(code))]


P_CATEGORIES_VIEW = _perm(Perm.CATEGORIES_VIEW)
P_CATEGORIES_CREATE = _perm(Perm.CATEGORIES_CREATE)
P_CATEGORIES_UPDATE = _perm(Perm.CATEGORIES_UPDATE)
P_CATEGORIES_DELETE = _perm(Perm.CATEGORIES_DELETE)
P_BRANDS_VIEW = _perm(Perm.BRANDS_VIEW)
P_BRANDS_CREATE = _perm(Perm.BRANDS_CREATE)
P_BRANDS_UPDATE = _perm(Perm.BRANDS_UPDATE)
P_BRANDS_DELETE = _perm(Perm.BRANDS_DELETE)
P_MODELS_VIEW = _perm(Perm.MODELS_VIEW)
P_MODELS_CREATE = _perm(Perm.MODELS_CREATE)
P_MODELS_UPDATE = _perm(Perm.MODELS_UPDATE)
P_MODELS_DELETE = _perm(Perm.MODELS_DELETE)
P_SPARE_PARTS_VIEW = _perm(Perm.SPARE_PARTS_VIEW)
P_SPARE_PARTS_CREATE = _perm(Perm.SPARE_PARTS_CREATE)
P_SPARE_PARTS_UPDATE = _perm(Perm.SPARE_PARTS_UPDATE)
P_SPARE_PARTS_DELETE = _perm(Perm.SPARE_PARTS_DELETE)

# ------------------------------------------------------------ categories
categories = APIRouter(prefix="/categories", tags=["categories"])


@categories.get("", response_model=PageResponse[CategoryResponse])
def list_categories(
    uow: UowDep, page: PageDep, _: P_CATEGORIES_VIEW, search: str | None = None, estado: bool | None = None
):
    return PageResponse[CategoryResponse].from_page(CategoryUseCases(uow).list(page, search, estado), CategoryResponse)


@categories.get("/{item_id}", response_model=CategoryResponse)
def get_category(item_id: int, uow: UowDep, _: P_CATEGORIES_VIEW):
    return CategoryResponse.model_validate(CategoryUseCases(uow).get(item_id))


@categories.post("", response_model=CategoryResponse, status_code=status.HTTP_201_CREATED)
def create_category(body: CatalogRequest, uow: UowDep, _: P_CATEGORIES_CREATE):
    return CategoryResponse.model_validate(CategoryUseCases(uow).create(CatalogData(**body.model_dump())))


@categories.put("/{item_id}", response_model=CategoryResponse)
def update_category(item_id: int, body: CatalogRequest, uow: UowDep, _: P_CATEGORIES_UPDATE):
    return CategoryResponse.model_validate(CategoryUseCases(uow).update(item_id, CatalogData(**body.model_dump())))


@categories.patch("/{item_id}/status", response_model=CategoryResponse)
def set_category_status(item_id: int, body: StatusUpdateRequest, uow: UowDep, _: P_CATEGORIES_UPDATE):
    return CategoryResponse.model_validate(CategoryUseCases(uow).set_status(item_id, body.estado))


@categories.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_category(item_id: int, uow: UowDep, _: P_CATEGORIES_DELETE) -> Response:
    CategoryUseCases(uow).delete(item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- brands
brands = APIRouter(prefix="/brands", tags=["brands"])


@brands.get("", response_model=PageResponse[BrandResponse])
def list_brands(
    uow: UowDep, page: PageDep, _: P_BRANDS_VIEW, search: str | None = None, estado: bool | None = None
):
    return PageResponse[BrandResponse].from_page(BrandUseCases(uow).list(page, search, estado), BrandResponse)


@brands.get("/{item_id}", response_model=BrandResponse)
def get_brand(item_id: int, uow: UowDep, _: P_BRANDS_VIEW):
    return BrandResponse.model_validate(BrandUseCases(uow).get(item_id))


@brands.post("", response_model=BrandResponse, status_code=status.HTTP_201_CREATED)
def create_brand(body: CatalogRequest, uow: UowDep, _: P_BRANDS_CREATE):
    return BrandResponse.model_validate(BrandUseCases(uow).create(CatalogData(**body.model_dump())))


@brands.put("/{item_id}", response_model=BrandResponse)
def update_brand(item_id: int, body: CatalogRequest, uow: UowDep, _: P_BRANDS_UPDATE):
    return BrandResponse.model_validate(BrandUseCases(uow).update(item_id, CatalogData(**body.model_dump())))


@brands.patch("/{item_id}/status", response_model=BrandResponse)
def set_brand_status(item_id: int, body: StatusUpdateRequest, uow: UowDep, _: P_BRANDS_UPDATE):
    return BrandResponse.model_validate(BrandUseCases(uow).set_status(item_id, body.estado))


@brands.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_brand(item_id: int, uow: UowDep, _: P_BRANDS_DELETE) -> Response:
    BrandUseCases(uow).delete(item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ---------------------------------------------------------------- models
models = APIRouter(prefix="/models", tags=["models"])


@models.get("", response_model=PageResponse[DeviceModelResponse])
def list_models(
    uow: UowDep,
    page: PageDep,
    _: P_MODELS_VIEW,
    search: str | None = None,
    brand_id: int | None = None,
    estado: bool | None = None,
):
    result = DeviceModelUseCases(uow).list(page, search, brand_id, estado)
    return PageResponse[DeviceModelResponse].from_page(result, DeviceModelResponse)


@models.get("/{item_id}", response_model=DeviceModelResponse)
def get_model(item_id: int, uow: UowDep, _: P_MODELS_VIEW):
    return DeviceModelResponse.model_validate(DeviceModelUseCases(uow).get(item_id))


@models.post("", response_model=DeviceModelResponse, status_code=status.HTTP_201_CREATED)
def create_model(body: DeviceModelRequest, uow: UowDep, _: P_MODELS_CREATE):
    return DeviceModelResponse.model_validate(DeviceModelUseCases(uow).create(DeviceModelData(**body.model_dump())))


@models.put("/{item_id}", response_model=DeviceModelResponse)
def update_model(item_id: int, body: DeviceModelRequest, uow: UowDep, _: P_MODELS_UPDATE):
    model = DeviceModelUseCases(uow).update(item_id, DeviceModelData(**body.model_dump()))
    return DeviceModelResponse.model_validate(model)


@models.patch("/{item_id}/status", response_model=DeviceModelResponse)
def set_model_status(item_id: int, body: StatusUpdateRequest, uow: UowDep, _: P_MODELS_UPDATE):
    return DeviceModelResponse.model_validate(DeviceModelUseCases(uow).set_status(item_id, body.estado))


@models.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_model(item_id: int, uow: UowDep, _: P_MODELS_DELETE) -> Response:
    DeviceModelUseCases(uow).delete(item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


# ----------------------------------------------------------- spare parts
spare_parts = APIRouter(prefix="/spare-parts", tags=["spare-parts"])


@spare_parts.get("", response_model=PageResponse[SparePartResponse])
def list_spare_parts(
    uow: UowDep, page: PageDep, _: P_SPARE_PARTS_VIEW, search: str | None = None, estado: bool | None = None
):
    result = SparePartUseCases(uow).list(page, search, estado)
    return PageResponse[SparePartResponse].from_page(result, SparePartResponse)


@spare_parts.get("/{item_id}", response_model=SparePartResponse)
def get_spare_part(item_id: int, uow: UowDep, _: P_SPARE_PARTS_VIEW):
    return SparePartResponse.model_validate(SparePartUseCases(uow).get(item_id))


@spare_parts.post("", response_model=SparePartResponse, status_code=status.HTTP_201_CREATED)
def create_spare_part(body: SparePartRequest, uow: UowDep, _: P_SPARE_PARTS_CREATE):
    return SparePartResponse.model_validate(SparePartUseCases(uow).create(SparePartData(**body.model_dump())))


@spare_parts.put("/{item_id}", response_model=SparePartResponse)
def update_spare_part(item_id: int, body: SparePartRequest, uow: UowDep, _: P_SPARE_PARTS_UPDATE):
    part = SparePartUseCases(uow).update(item_id, SparePartData(**body.model_dump()))
    return SparePartResponse.model_validate(part)


@spare_parts.patch("/{item_id}/status", response_model=SparePartResponse)
def set_spare_part_status(item_id: int, body: StatusUpdateRequest, uow: UowDep, _: P_SPARE_PARTS_UPDATE):
    return SparePartResponse.model_validate(SparePartUseCases(uow).set_status(item_id, body.estado))


@spare_parts.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_spare_part(item_id: int, uow: UowDep, _: P_SPARE_PARTS_DELETE) -> Response:
    SparePartUseCases(uow).delete(item_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
