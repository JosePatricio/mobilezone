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
    por_mayor: bool = Field(default=False, description="true = precio al por mayor en lugar del PVP")


class SaleDataRequest(RequestSchema):
    items: list[SaleItemRequest] = Field(min_length=1)
    metodo_pago: PaymentMethod = Field(description="EFECTIVO, TRANSFERENCIA o TARJETA (+6 %)")
    monto_recibido: Money | None = Field(default=None, description="Solo efectivo: monto recibido para calcular el cambio")
    factura: bool = Field(default=False, description="true = factura, false = comprobante de venta")
    cliente_id: int | None = Field(default=None, description="null = consumidor final")
    descuento: Money = Field(default=Decimal("0"), description="Descuento (USD) sobre el total de los productos")


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
    por_mayor: bool = Field(description="Vendido al precio al por mayor")
    subtotal: Decimal


class SaleBranch(BranchRef):
    """Branch of the sale with the contact data printed on the receipt."""

    ubicacion: str
    direccion: str | None
    telefono: str | None


class SaleWorkOrderRef(Schema):
    id: int
    num_orden: int


class SaleResponse(Schema):
    id: int
    user_id: int
    user: UserSummary
    branch_id: int
    branch: SaleBranch
    fecha: datetime
    total: Decimal = Field(description="Suma de los productos (antes del descuento)")
    estado: SaleStatus
    factura: bool
    metodo_pago: PaymentMethod | None = Field(description="null en ventas anteriores al registro de pagos")
    descuento: Decimal
    recargo: Decimal
    total_pagar: Decimal = Field(description="total - descuento + recargo")
    monto_recibido: Decimal | None
    cambio: Decimal | None
    cliente_id: int | None
    cliente: ClientSummary | None = Field(description="null = consumidor final")
    work_order_id: int | None = Field(description="Venta de una orden de trabajo finalizada (sin productos)")
    work_order: SaleWorkOrderRef | None
    details: list[SaleDetailResponse]
    created_at: datetime
    updated_at: datetime


class SalesSummaryResponse(Schema):
    fecha: date
    cantidad: int
    total: Decimal = Field(description="Monto cobrado (total a pagar) de las ventas confirmadas")


class CashOpeningRequest(RequestSchema):
    branch_id: int = Field(description="Sucursal en la que trabaja hoy el vendedor")
    monto_inicial: Money = Field(description="Efectivo en caja al iniciar el día (USD), para dar cambio")


class CashOpeningResponse(Schema):
    id: int
    user_id: int
    branch_id: int
    branch: BranchRef
    fecha: date
    monto_inicial: Decimal
    created_at: datetime
