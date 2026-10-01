from __future__ import annotations

from enum import Enum, IntEnum

from app.domain.exceptions import ValidationError


class SystemRole(str, Enum):
    """Roles the business rules depend on (a user's role is its only "type").

    Internal users and clients share the ``users`` table; clients have the
    CLIENTE role. System roles cannot be renamed, deactivated or deleted.
    Additional custom roles can be created from the UI.
    """

    ADMIN = "ADMIN"
    VENDEDOR = "VENDEDOR"
    TECNICO = "TECNICO"
    CLIENTE = "CLIENTE"


SYSTEM_ROLES: frozenset[str] = frozenset(r.value for r in SystemRole)


class SaleStatus(str, Enum):
    CONFIRMADA = "CONFIRMADA"
    ANULADA = "ANULADA"


class StockMovementType(str, Enum):
    VENTA = "VENTA"
    ANULACION_VENTA = "ANULACION_VENTA"
    DEVOLUCION = "DEVOLUCION"  # units returned when a sale is modified
    AJUSTE = "AJUSTE"


class PaymentMethod(str, Enum):
    EFECTIVO = "EFECTIVO"
    TRANSFERENCIA = "TRANSFERENCIA"
    TARJETA = "TARJETA"  # credit card: adds a surcharge (CARD_SURCHARGE_RATE)


class WorkOrderStatus(IntEnum):
    """Work order status (stored as 0, 1, 2).

    FINALIZADO closes the order: it can no longer be modified and a sale is registered.
    Labels are centralized here and exposed through the API.
    """

    RECIBIDO = 0
    EN_PROCESO = 1
    FINALIZADO = 2

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


WORK_ORDER_STATUS_LABELS: dict[WorkOrderStatus, str] = {
    WorkOrderStatus.RECIBIDO: "Recibido",
    WorkOrderStatus.EN_PROCESO: "En proceso",
    WorkOrderStatus.FINALIZADO: "Finalizado",
}
