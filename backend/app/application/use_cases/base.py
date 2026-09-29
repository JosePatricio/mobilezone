from __future__ import annotations

from typing import Generic, TypeVar

from app.domain.entities import User
from app.domain.exceptions import ConflictError, NotFoundError, PermissionDeniedError
from app.domain.repositories import Repository, UnitOfWork

E = TypeVar("E")


class UseCase:
    def __init__(self, uow: UnitOfWork) -> None:
        self.uow = uow


class CrudUseCases(UseCase, Generic[E]):
    """Shared get / set_status / delete behaviour for simple catalog entities."""

    entity_label = "Registro"
    not_found_code = "NOT_FOUND"

    def _repo(self) -> Repository[E]:
        raise NotImplementedError

    def get(self, entity_id: int) -> E:
        entity = self._repo().get(entity_id)
        if entity is None:
            raise NotFoundError(f"{self.entity_label} no encontrado(a).", code=self.not_found_code)
        return entity

    def set_status(self, entity_id: int, estado: bool) -> E:
        with self.uow.transaction():
            entity = self.get(entity_id)
            entity.set_status(estado)  # type: ignore[attr-defined]
        return entity

    def delete(self, entity_id: int) -> None:
        """Physical delete; rejected with 409 when other records reference it."""
        try:
            with self.uow.transaction():
                self._repo().delete(self.get(entity_id))
        except ConflictError as exc:
            raise ConflictError(
                f"No se puede eliminar: {self.entity_label.lower()} tiene registros asociados. "
                "Desactívelo en su lugar.",
                code="ENTITY_IN_USE",
            ) from exc


def require_permission(actor: User, code: str) -> None:
    if not actor.has_permission(code):
        raise PermissionDeniedError("No tiene permisos para realizar esta acción.", details={"permission": code})
