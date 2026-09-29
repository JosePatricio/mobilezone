from __future__ import annotations

from enum import Enum, IntEnum

from app.domain.exceptions import ValidationError


class UserType(str, Enum):
    """User types. The same ``users`` table stores internal users and clients.

    New types can be appended here without schema changes (stored as VARCHAR).
    """

    ADMIN = "ADMIN"
    USUARIO = "USUARIO"
    TECNICO = "TECNICO"
    CLIENTE = "CLIENTE"


class SaleStatus(str, Enum):
    CONFIRMADA = "CONFIRMADA"
    ANULADA = "ANULADA"


class StockMovementType(str, Enum):
    VENTA = "VENTA"
    ANULACION_VENTA = "ANULACION_VENTA"
    AJUSTE = "AJUSTE"


class WorkOrderStatus(IntEnum):
    """Work order status.

    The spec defines the values 0, 1 and 2 but their meaning is still pending.
    Labels are centralized here (and exposed through the API) so they can be
    renamed in a single place once defined.
    """

    ESTADO_0 = 0
    ESTADO_1 = 1
    ESTADO_2 = 2

    @property
    def label(self) -> str:
        return WORK_ORDER_STATUS_LABELS[self]

    @classmethod
    def parse(cls, value: int) -> "WorkOrderStatus":
        try:
            return cls(int(value))
        except (ValueError, TypeError) as exc:
            allowed = ", ".join(str(s.value) for s in cls)
            raise ValidationError(
                f"Estado de orden inválido: {value}. Valores permitidos: {allowed}.",
                code="INVALID_WORK_ORDER_STATUS",
            ) from exc


# Provisional labels — meaning pending definition (BACKEND_SPEC §14).
WORK_ORDER_STATUS_LABELS: dict[WorkOrderStatus, str] = {
    WorkOrderStatus.ESTADO_0: "Recibida",
    WorkOrderStatus.ESTADO_1: "En proceso",
    WorkOrderStatus.ESTADO_2: "Finalizada",
}
