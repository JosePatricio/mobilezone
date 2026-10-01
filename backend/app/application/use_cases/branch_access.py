from __future__ import annotations

from app.domain.entities import Branch, User
from app.domain.exceptions import PermissionDeniedError, ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.permissions import Perm


def can_operate_branch(actor: User, branch_id: int) -> bool:
    """Users operate in their assigned branches; ``branches.any`` grants every branch."""
    return branch_id in actor.branch_ids or actor.has_permission(Perm.BRANCHES_ANY)


def ensure_branch_access(uow: UnitOfWork, actor: User, branch_id: int) -> Branch:
    """The branch must exist, be active and be operable by the actor (sell / change stock)."""
    branch = uow.branches.get(branch_id)
    if branch is None or not branch.estado:
        raise ValidationError("La sucursal seleccionada no existe o está inactiva.", code="INVALID_BRANCH")
    if not can_operate_branch(actor, branch_id):
        raise PermissionDeniedError(
            "No está asignado a la sucursal seleccionada.", code="BRANCH_NOT_ASSIGNED", details={"branch_id": branch_id}
        )
    return branch
