from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Response, UploadFile, status

from app.application.dto import ProductData
from app.application.use_cases.catalog import CategoryUseCases
from app.application.use_cases.products import ProductUseCases
from app.domain.value_objects.pagination import MAX_PAGE_SIZE, PageRequest
from app.domain.entities import User
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import (
    PageDep,
    StorageDep,
    UowDep,
    read_upload,
    require_any_permission,
    require_permissions,
)
from app.presentation.api.schemas.catalog import CategorySummary
from app.presentation.api.schemas.common import PageResponse, StatusUpdateRequest
from app.presentation.api.schemas.products import (
    ProductRequest,
    ProductResponse,
)

router = APIRouter(prefix="/products", tags=["products"])

CanView = Annotated[User, Depends(require_permissions(Perm.PRODUCTS_VIEW))]
CanUpdate = Annotated[User, Depends(require_permissions(Perm.PRODUCTS_UPDATE))]
# The image can be uploaded right after creating the product (sellers can create but not edit).
CanSetImage = Annotated[User, Depends(require_any_permission(Perm.PRODUCTS_UPDATE, Perm.PRODUCTS_CREATE))]


@router.get("/category-options", response_model=list[CategorySummary])
def category_options(uow: UowDep, _: CanView):
    """Active categories for the product form (does not require access to the Categorías module)."""
    result = CategoryUseCases(uow).list(PageRequest(1, MAX_PAGE_SIZE), estado=True)
    return [CategorySummary.model_validate(c) for c in result.items]


@router.get("", response_model=PageResponse[ProductResponse])
def list_products(
    uow: UowDep,
    page: PageDep,
    _: CanView,
    search: str | None = None,
    category_id: int | None = None,
    estado: bool | None = None,
):
    result = ProductUseCases(uow).list(page, search, category_id, estado)
    return PageResponse[ProductResponse].from_page(result, ProductResponse)


@router.get("/{product_id}", response_model=ProductResponse)
def get_product(product_id: int, uow: UowDep, _: CanView):
    return ProductResponse.model_validate(ProductUseCases(uow).get(product_id))


@router.post("", response_model=ProductResponse, status_code=status.HTTP_201_CREATED)
def create_product(
    body: ProductRequest,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.PRODUCTS_CREATE))],
):
    """Creates the product. Its stock is registered per branch in /inventory."""
    product = ProductUseCases(uow).create(ProductData(**body.model_dump()))
    return ProductResponse.model_validate(product)


@router.put("/{product_id}", response_model=ProductResponse)
def update_product(product_id: int, body: ProductRequest, uow: UowDep, _: CanUpdate):
    product = ProductUseCases(uow).update(product_id, ProductData(**body.model_dump()))
    return ProductResponse.model_validate(product)


@router.put("/{product_id}/image", response_model=ProductResponse)
def upload_product_image(product_id: int, file: UploadFile, uow: UowDep, storage: StorageDep, _: CanSetImage):
    """Uploads the product image (JPG, PNG or WEBP, max 2 MB). Without image the client shows a default one."""
    content = read_upload(file)
    return ProductResponse.model_validate(ProductUseCases(uow, storage).set_image(product_id, content))


@router.delete("/{product_id}/image", response_model=ProductResponse)
def delete_product_image(product_id: int, uow: UowDep, storage: StorageDep, _: CanUpdate):
    return ProductResponse.model_validate(ProductUseCases(uow, storage).set_image(product_id, None))


@router.patch("/{product_id}/status", response_model=ProductResponse)
def set_product_status(
    product_id: int,
    body: StatusUpdateRequest,
    uow: UowDep,
    _: Annotated[User, Depends(require_permissions(Perm.PRODUCTS_UPDATE))],
):
    return ProductResponse.model_validate(ProductUseCases(uow).set_status(product_id, body.estado))


@router.delete("/{product_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_product(
    product_id: int, uow: UowDep, storage: StorageDep, _: Annotated[User, Depends(require_permissions(Perm.PRODUCTS_DELETE))]
) -> Response:
    ProductUseCases(uow, storage).delete(product_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)
