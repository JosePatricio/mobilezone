from __future__ import annotations

from app.application.services.files import FileStorage
from app.application.use_cases.base import UseCase
from app.domain.exceptions import ValidationError
from app.domain.repositories import UnitOfWork
from app.domain.value_objects.enums import SystemRole

# Text the administrator must type to confirm the reset (guards against an accidental click).
RESET_CONFIRMATION = "VACIAR"


class ResetBusinessDataUseCase(UseCase):
    """Empties the business data: work orders, sales, inventory, products, categories, brands,
    models, spare parts and clients. Users, roles, permissions and branches are kept."""

    def __init__(self, uow: UnitOfWork, storage: FileStorage) -> None:
        super().__init__(uow)
        self.storage = storage

    def execute(self, confirmacion: str) -> dict[str, int]:
        if confirmacion.strip().upper() != RESET_CONFIRMATION:
            raise ValidationError(
                f'Escriba "{RESET_CONFIRMATION}" para confirmar.', code="RESET_NOT_CONFIRMED"
            )
        with self.uow.transaction():
            counts, files = self.uow.data_reset.delete_business_data(SystemRole.CLIENTE.value)
        self.uow.data_reset.restart_numbering()
        for path in files:
            self.storage.delete(path)
        return counts
