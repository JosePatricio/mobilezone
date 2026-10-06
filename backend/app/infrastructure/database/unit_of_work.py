from __future__ import annotations

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.domain.exceptions import ConflictError
from app.domain.repositories import UnitOfWork
from app.infrastructure.repositories.sqlalchemy import (
    SqlAlchemyBranchRepository,
    SqlAlchemyBrandRepository,
    SqlAlchemyCategoryRepository,
    SqlAlchemyDataResetRepository,
    SqlAlchemyDeviceModelRepository,
    SqlAlchemyInventoryRepository,
    SqlAlchemyPermissionRepository,
    SqlAlchemyProductRepository,
    SqlAlchemyRoleRepository,
    SqlAlchemySaleRepository,
    SqlAlchemySparePartRepository,
    SqlAlchemyStockMovementRepository,
    SqlAlchemyUserRepository,
    SqlAlchemyWorkOrderRepository,
)


class SqlAlchemyUnitOfWork(UnitOfWork):
    """Unit of Work bound to one SQLAlchemy session (one per request)."""

    def __init__(self, session: Session) -> None:
        self.session = session
        self.users = SqlAlchemyUserRepository(session)
        self.roles = SqlAlchemyRoleRepository(session)
        self.permissions = SqlAlchemyPermissionRepository(session)
        self.categories = SqlAlchemyCategoryRepository(session)
        self.products = SqlAlchemyProductRepository(session)
        self.branches = SqlAlchemyBranchRepository(session)
        self.inventory = SqlAlchemyInventoryRepository(session)
        self.stock_movements = SqlAlchemyStockMovementRepository(session)
        self.sales = SqlAlchemySaleRepository(session)
        self.brands = SqlAlchemyBrandRepository(session)
        self.models = SqlAlchemyDeviceModelRepository(session)
        self.spare_parts = SqlAlchemySparePartRepository(session)
        self.work_orders = SqlAlchemyWorkOrderRepository(session)
        self.data_reset = SqlAlchemyDataResetRepository(session)

    def _translate(self, exc: IntegrityError) -> ConflictError:
        return ConflictError(
            "La operación viola una restricción de integridad de los datos.",
            code="INTEGRITY_CONFLICT",
        )

    def flush(self) -> None:
        try:
            self.session.flush()
        except IntegrityError as exc:
            raise self._translate(exc) from exc

    def commit(self) -> None:
        try:
            self.session.commit()
        except IntegrityError as exc:
            self.session.rollback()
            raise self._translate(exc) from exc

    def rollback(self) -> None:
        self.session.rollback()

    def close(self) -> None:
        self.session.close()
