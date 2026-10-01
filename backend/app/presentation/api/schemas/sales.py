from __future__ import annotations

from datetime import date, datetime
from decimal import Decimal

from pydantic import Field

from app.domain.value_objects.enums import PaymentMethod, SaleStatus
from app.presentation.api.schemas.common import Money, RequestSchema, Schema
from app.presentation.api.schemas.products import ProductSummary
from app.presentation.api.schemas.users import BranchRef, ClientSummary, UserSummary


class SaleItemRequest(RequestSchema):
    inventory_id: int = Field(description="Inventario (producto + sucursal) del que se descuenta el stock")
    cantidad: int = Field(gt=0)


class SaleDataRequest(RequestSchema):
    items: list[SaleItemRequest] = Field(min_length=1)
    metodo_pago: PaymentMethod = Field(description="EFECTIVO, TRANSFERENCIA o TARJETA (+6 %)")
    monto_recibido: Money | None = Field(default=None, description="Solo efectivo: monto recibido para calcular el cambio")
    factura: bool = Field(default=False, description="true = factura, false = comprobante de venta")
    cliente_id: int | None = Field(default=None, description="null = consumidor final")


class CreateSaleRequest(SaleDataRequest):
    branch_id: int = Field(description="Sucursal de la venta (asignada al vendedor)")


class UpdateSaleRequest(SaleDataRequest):
    """Complete new list of lines (returns reduce or remove lines). The branch cannot change."""


class SaleDetailResponse(Schema):
    id: int
    product_id: int
    product: ProductSummary
    inventory_id: int
    cantidad: int
    precio_unitario: Decimal
    subtotal: Decimal


class SaleResponse(Schema):
    id: int
    user_id: int
    user: UserSummary
    branch_id: int
    branch: BranchRef
    fecha: datetime
    total: Decimal
    estado: SaleStatus
    factura: bool
    metodo_pago: PaymentMethod | None = Field(description="null en ventas anteriores al registro de pagos")
    recargo: Decimal
    total_pagar: Decimal
    monto_recibido: Decimal | None
    cambio: Decimal | None
    cliente_id: int | None
    cliente: ClientSummary | None = Field(description="null = consumidor final")
    details: list[SaleDetailResponse]
    created_at: datetime
    updated_at: datetime


class SalesSummaryResponse(Schema):
    fecha: date
    cantidad: int
    total: Decimal = Field(description="Monto cobrado (total a pagar) de las ventas confirmadas")
