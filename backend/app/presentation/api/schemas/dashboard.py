from __future__ import annotations

from datetime import date
from decimal import Decimal

from pydantic import Field

from app.application.use_cases.dashboard import Grouping
from app.domain.value_objects.work_orders import EntryReason
from app.presentation.api.schemas.common import Schema


class PeriodStatsResponse(Schema):
    inicio: date = Field(description="Primer día del período (día, lunes de la semana, 1.º del mes o del año)")
    etiqueta: str
    ventas: int | None = Field(description="Ventas confirmadas (null sin permiso de ventas)")
    monto: Decimal | None = Field(description="Total cobrado (total_pagar)")
    ordenes: int | None = Field(description="Órdenes de trabajo recibidas (null sin permiso de órdenes)")


class DashboardChartsResponse(Schema):
    agrupacion: Grouping
    periodos: list[PeriodStatsResponse]


class DayOrdersResponse(Schema):
    fecha: date
    recibidas: int = Field(description="Órdenes recibidas ese día")
    en_proceso: int = Field(description="Órdenes que pasaron a En proceso ese día")
    finalizadas: int = Field(description="Órdenes finalizadas ese día")


class LowStockProductResponse(Schema):
    id: int
    sku: str
    nombre: str
    stock: int = Field(description="Stock total (suma de todas las sucursales)")
    minimo_recomendado: int
    faltante: int = Field(description="Unidades que faltan para llegar al mínimo recomendado")


class TopProductResponse(Schema):
    id: int
    sku: str
    nombre: str
    cantidad: int = Field(description="Unidades vendidas (ventas confirmadas)")
    monto: Decimal = Field(description="Total vendido del producto (suma de subtotales)")


class StockValueResponse(Schema):
    activo_neto: Decimal = Field(description="Suma de PVP × stock total de todos los productos")
    activo_bruto: Decimal = Field(description="Suma de costo × stock total de todos los productos")


class BrandOrdersResponse(Schema):
    id: int
    nombre: str
    ordenes: int = Field(description="Órdenes de trabajo recibidas de la marca")


class EntryReasonCountResponse(Schema):
    motivo: EntryReason
    etiqueta: str
    ordenes: int = Field(description="Órdenes con ese motivo de ingreso (una orden puede tener varios)")
