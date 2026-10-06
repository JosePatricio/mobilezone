from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Query, Response, status

from app.application.dto import AffiliatePartData, AffiliatePartFilters
from app.application.use_cases.affiliate_parts import AffiliatePartUseCases, PublicAffiliatePartsUseCases
from app.domain.entities import User
from app.domain.value_objects.affiliate_parts import AffiliatePartStatus, AffiliatePartType, PartCondition
from app.domain.value_objects.permissions import Perm
from app.presentation.api.dependencies import PageDep, UowDep, require_permissions
from app.presentation.api.schemas.affiliate_parts import (
    AffiliatePartCatalogsResponse,
    AffiliatePartRequest,
    AffiliatePartResponse,
    AffiliatePartStatusRequest,
    VisitsResponse,
)
from app.presentation.api.schemas.common import PageResponse

router = APIRouter(prefix="/affiliate-parts", tags=["affiliate-parts"])
public_router = APIRouter(prefix="/public/affiliate-parts", tags=["public"])

CanManage = Annotated[User, Depends(require_permissions(Perm.AFFILIATE_PARTS_MANAGE))]


def get_filters(
    tipo: AffiliatePartType | None = None,
    condicion: PartCondition | None = None,
    estado: AffiliatePartStatus | None = None,
    garantia: bool | None = None,
    search: Annotated[str | None, Query(max_length=100)] = None,
    user_id: Annotated[int | None, Query(description="Afiliado")] = None,
) -> AffiliatePartFilters:
    return AffiliatePartFilters(
        tipo=tipo, condicion=condicion, estado=estado, garantia=garantia, search=search, user_id=user_id
    )


FiltersDep = Annotated[AffiliatePartFilters, Depends(get_filters)]


@router.get("", response_model=PageResponse[AffiliatePartResponse])
def list_affiliate_parts(uow: UowDep, page: PageDep, filters: FiltersDep, actor: CanManage):
    """The spare parts the logged affiliate published (every affiliate with ``affiliate_parts.any``)."""
    result = AffiliatePartUseCases(uow).list(actor, page, filters)
    return PageResponse[AffiliatePartResponse].from_page(result, AffiliatePartResponse)


@router.get("/visits", response_model=VisitsResponse)
def public_catalog_visits(uow: UowDep, _: CanManage):
    """How many times the public catalog of spare parts was visited."""
    return VisitsResponse(visitas=AffiliatePartUseCases(uow).visits())


@router.get("/{part_id}", response_model=AffiliatePartResponse)
def get_affiliate_part(part_id: int, uow: UowDep, actor: CanManage):
    return AffiliatePartResponse.model_validate(AffiliatePartUseCases(uow).get(actor, part_id))


@router.post("", response_model=AffiliatePartResponse, status_code=status.HTTP_201_CREATED)
def create_affiliate_part(body: AffiliatePartRequest, uow: UowDep, actor: CanManage):
    part = AffiliatePartUseCases(uow).create(actor, AffiliatePartData(**body.model_dump()))
    return AffiliatePartResponse.model_validate(part)


@router.put("/{part_id}", response_model=AffiliatePartResponse)
def update_affiliate_part(part_id: int, body: AffiliatePartRequest, uow: UowDep, actor: CanManage):
    part = AffiliatePartUseCases(uow).update(actor, part_id, AffiliatePartData(**body.model_dump()))
    return AffiliatePartResponse.model_validate(part)


@router.patch("/{part_id}/status", response_model=AffiliatePartResponse)
def set_affiliate_part_status(part_id: int, body: AffiliatePartStatusRequest, uow: UowDep, actor: CanManage):
    """Disponible / Vendido."""
    part = AffiliatePartUseCases(uow).set_status(actor, part_id, body.estado)
    return AffiliatePartResponse.model_validate(part)


@router.delete("/{part_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_affiliate_part(part_id: int, uow: UowDep, actor: CanManage) -> Response:
    AffiliatePartUseCases(uow).delete(actor, part_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@public_router.get("/catalogs", response_model=AffiliatePartCatalogsResponse)
def affiliate_part_catalogs():
    """Spare part types, conditions (nuevo / usado) and statuses (disponible / vendido)."""
    return AffiliatePartCatalogsResponse.build()


@public_router.get("", response_model=PageResponse[AffiliatePartResponse])
def public_affiliate_parts(uow: UowDep, page: PageDep, filters: FiltersDep):
    """Public catalog: the spare parts of every affiliate. No authentication."""
    result = PublicAffiliatePartsUseCases(uow).list(page, filters)
    return PageResponse[AffiliatePartResponse].from_page(result, AffiliatePartResponse)


@public_router.post("/visits", response_model=VisitsResponse)
def register_public_visit(uow: UowDep):
    """Counts one visit of the public catalog page (called once when the page opens)."""
    return VisitsResponse(visitas=PublicAffiliatePartsUseCases(uow).register_visit())
