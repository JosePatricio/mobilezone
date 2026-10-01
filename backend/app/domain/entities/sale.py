from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime
from decimal import Decimal
from typing import TYPE_CHECKING

from app.domain.entities.base import utcnow
from app.domain.exceptions import ConflictError, ValidationError
from app.domain.value_objects.enums import PaymentMethod, SaleStatus
from app.domain.value_objects.money import ZERO, non_negative_money, to_money

# Credit card surcharge on the final price (6 %).
CARD_SURCHARGE_RATE = Decimal("0.06")

if TYPE_CHECKING:
    from app.domain.entities.branch import Branch
    from app.domain.entities.product import Product
    from app.domain.entities.user import User


@dataclass(eq=False)
class SaleDetail:
    """A sale line. ``precio_unitario`` is the historical price at sale time and
    ``inventory_id`` the branch inventory the units were taken from."""

    product_id: int
    cantidad: int
    precio_unitario: Decimal
    inventory_id: int | None = None
    subtotal: Decimal = ZERO
    sale_id: int | None = None
    id: int | None = None

    if TYPE_CHECKING:
        product: Product

    def __post_init__(self) -> None:
        if not isinstance(self.cantidad, int) or self.cantidad <= 0:
            raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
        self.precio_unitario = non_negative_money(self.precio_unitario, "precio_unitario")
        self.subtotal = self.precio_unitario * self.cantidad

    def change_quantity(self, cantidad: int) -> None:
        """Keeps the historical unit price; only the quantity (and subtotal) change."""
        if not isinstance(cantidad, int) or cantidad <= 0:
            raise ValidationError("La cantidad debe ser un entero mayor que cero.", code="INVALID_QUANTITY")
        self.cantidad = cantidad
        self.subtotal = self.precio_unitario * cantidad


@dataclass(eq=False)
class Sale:
    """A sale. ``factura`` = True issues an invoice, False a sales receipt (comprobante).

    ``cliente_id`` None means "Consumidor final". ``total`` is the sum of the lines;
    ``total_pagar`` adds the credit card surcharge (``recargo``). For cash payments
    ``monto_recibido`` and ``cambio`` (change to give back) are recorded.
    ``metodo_pago`` is None only for sales registered before payments were recorded.
    """

    user_id: int
    branch_id: int | None = None  # branch (sucursal) where the sale is made
    fecha: datetime | None = None
    total: Decimal = ZERO
    estado: SaleStatus = SaleStatus.CONFIRMADA
    factura: bool = False
    cliente_id: int | None = None
    metodo_pago: PaymentMethod | None = None
    recargo: Decimal = ZERO
    total_pagar: Decimal = ZERO
    monto_recibido: Decimal | None = None
    cambio: Decimal | None = None
    details: list[SaleDetail] = field(default_factory=list)
    id: int | None = None
    created_at: datetime | None = None
    updated_at: datetime | None = None

    if TYPE_CHECKING:
        user: User
        cliente: User | None
        branch: Branch

    def __post_init__(self) -> None:
        self.estado = SaleStatus(self.estado)
        self.factura = bool(self.factura)
        if self.metodo_pago is not None:
            self.metodo_pago = PaymentMethod(self.metodo_pago)
        if self.fecha is None:
            self.fecha = utcnow()

    def add_line(
        self, product_id: int, cantidad: int, precio_unitario: Decimal, inventory_id: int | None = None
    ) -> SaleDetail:
        if self.estado != SaleStatus.CONFIRMADA:
            raise ConflictError("No se pueden agregar productos a una venta anulada.", code="SALE_NOT_EDITABLE")
        detail = SaleDetail(
            product_id=product_id, cantidad=cantidad, precio_unitario=precio_unitario, inventory_id=inventory_id
        )
        self.details.append(detail)
        self.recalculate_total()
        return detail

    def recalculate_total(self) -> None:
        self.total = sum((d.subtotal for d in self.details), ZERO)
        self.total_pagar = self.total + self.recargo

    def ensure_editable(self) -> None:
        if self.estado != SaleStatus.CONFIRMADA:
            raise ConflictError("Una venta anulada no se puede modificar.", code="SALE_NOT_EDITABLE")

    def apply_payment(self, metodo_pago: PaymentMethod, monto_recibido: Decimal | None = None) -> None:
        """Computes the amount to pay and, for cash, the change.

        * TARJETA: ``recargo`` = 6 % of the total (rounded to cents).
        * EFECTIVO: the received amount is optional; when given it must cover the total.
        """
        self.metodo_pago = PaymentMethod(metodo_pago)
        self.recargo = (
            to_money(self.total * CARD_SURCHARGE_RATE, "recargo") if self.metodo_pago == PaymentMethod.TARJETA else ZERO
        )
        self.total_pagar = self.total + self.recargo
        self.monto_recibido = None
        self.cambio = None
        if self.metodo_pago == PaymentMethod.EFECTIVO and monto_recibido is not None:
            recibido = non_negative_money(monto_recibido, "monto_recibido")
            if recibido < self.total_pagar:
                raise ValidationError(
                    "El monto recibido no cubre el total a pagar.",
                    code="INSUFFICIENT_PAYMENT",
                    details={"field": "monto_recibido", "total_pagar": str(self.total_pagar)},
                )
            self.monto_recibido = recibido
            self.cambio = recibido - self.total_pagar

    def cancel(self) -> None:
        if self.estado == SaleStatus.ANULADA:
            raise ConflictError("La venta ya se encuentra anulada.", code="SALE_ALREADY_CANCELLED")
        self.estado = SaleStatus.ANULADA
