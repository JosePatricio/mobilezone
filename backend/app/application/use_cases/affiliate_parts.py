from __future__ import annotations

from app.application.dto import AffiliatePartData, AffiliatePartFilters
from app.application.use_cases.base import UseCase
from app.domain.entities import AffiliatePart, User
from app.domain.exceptions import NotFoundError
from app.domain.value_objects.affiliate_parts import PUBLIC_CATALOG_PAGE, AffiliatePartStatus
from app.domain.value_objects.pagination import Page, PageRequest
from app.domain.value_objects.permissions import Perm


def _list(uow, page: PageRequest, filters: AffiliatePartFilters, user_id: int | None, public: bool):
    return uow.affiliate_parts.list(
        page,
        user_id=user_id,
        tipo=filters.tipo,
        condicion=filters.condicion,
        estado=filters.estado,
        garantia=filters.garantia,
        search=filters.search,
        active_affiliates=public,
    )


class AffiliatePartUseCases(UseCase):
    """Module of the affiliates (technicians): each one publishes and manages their own spare parts.

    With ``affiliate_parts.any`` (administrator) the parts of every affiliate are managed.
    """

    @staticmethod
    def _manages_all(actor: User) -> bool:
        return actor.has_permission(Perm.AFFILIATE_PARTS_ANY)

    def list(self, actor: User, page: PageRequest, filters: AffiliatePartFilters) -> Page[AffiliatePart]:
        user_id = filters.user_id if self._manages_all(actor) else actor.id
        return _list(self.uow, page, filters, user_id, public=False)

    def get(self, actor: User, part_id: int) -> AffiliatePart:
        part = self.uow.affiliate_parts.get(part_id)
        # Parts of other affiliates look missing (no information leak).
        if part is None or not (part.is_owned_by(actor.id) or self._manages_all(actor)):
            raise NotFoundError("Repuesto no encontrado.", code="AFFILIATE_PART_NOT_FOUND")
        return part

    def create(self, actor: User, data: AffiliatePartData) -> AffiliatePart:
        with self.uow.transaction():
            part = AffiliatePart(user_id=actor.id, **_fields(data))
            self.uow.affiliate_parts.add(part)
        return part

    def update(self, actor: User, part_id: int, data: AffiliatePartData) -> AffiliatePart:
        with self.uow.transaction():
            part = self.get(actor, part_id)
            changes = AffiliatePart(user_id=part.user_id, **_fields(data))
            for attr in ("tipo", "condicion", "garantia", "estado", "descripcion", "precio"):
                setattr(part, attr, getattr(changes, attr))
        return part

    def set_status(self, actor: User, part_id: int, estado: AffiliatePartStatus) -> AffiliatePart:
        """Disponible / Vendido."""
        with self.uow.transaction():
            part = self.get(actor, part_id)
            part.estado = AffiliatePartStatus(estado)
        return part

    def delete(self, actor: User, part_id: int) -> None:
        with self.uow.transaction():
            self.uow.affiliate_parts.delete(self.get(actor, part_id))

    def visits(self) -> int:
        """How many times the public catalog was visited."""
        return self.uow.page_visits.count(PUBLIC_CATALOG_PAGE)


class PublicAffiliatePartsUseCases(UseCase):
    """Public catalog: everyone sees the spare parts of every (active) affiliate."""

    def list(self, page: PageRequest, filters: AffiliatePartFilters) -> Page[AffiliatePart]:
        return _list(self.uow, page, filters, filters.user_id, public=True)

    def register_visit(self) -> int:
        with self.uow.transaction():
            return self.uow.page_visits.increment(PUBLIC_CATALOG_PAGE)


def _fields(data: AffiliatePartData) -> dict:
    return {
        "tipo": data.tipo,
        "condicion": data.condicion,
        "garantia": data.garantia,
        "estado": data.estado,
        "descripcion": data.descripcion,
        "precio": data.precio,
    }
