import type { WorkOrderListItem } from '@/modules/work-orders/types';
import { http } from '@/shared/services/httpClient';
import type { Money } from '@/shared/types/api';

export type Grouping = 'dia' | 'semana' | 'mes' | 'anio';

export interface PeriodStats {
  /** First day of the period (ISO date). */
  inicio: string;
  etiqueta: string;
  /** Confirmed sales; null without permission to see sales. */
  ventas: number | null;
  monto: Money | null;
  /** Work orders received; null without permission to see orders. */
  ordenes: number | null;
}

export interface DashboardCharts {
  agrupacion: Grouping;
  periodos: PeriodStats[];
}

/** Work orders of one day: received that day, and moved to En proceso / Finalizado that day. */
export interface DayOrders {
  fecha: string;
  recibidas: number;
  en_proceso: number;
  finalizadas: number;
}

/** Active product whose total stock is below its recommended minimum. */
export interface LowStockProduct {
  id: number;
  sku: string;
  nombre: string;
  /** Total stock of every branch. */
  stock: number;
  minimo_recomendado: number;
  /** Units missing to reach the minimum. */
  faltante: number;
}

/** Product and what was sold of it in confirmed sales. */
export interface TopProduct {
  id: number;
  sku: string;
  nombre: string;
  /** Units sold. */
  cantidad: number;
  monto: Money;
}

/** Value of the total stock of every product. */
export interface StockValue {
  /** Sum of PVP × total stock. */
  activo_neto: Money;
  /** Sum of cost × total stock. */
  activo_bruto: Money;
}

/** Brand and the work orders received of its phones. */
export interface BrandOrders {
  id: number;
  nombre: string;
  ordenes: number;
}

/** Work orders with an entry reason (an order with several reasons counts in each). */
export interface EntryReasonCount {
  motivo: string;
  etiqueta: string;
  ordenes: number;
}

export const DASHBOARD_KEY = 'dashboard';

export const dashboardApi = {
  charts: (agrupacion: Grouping) =>
    http.get<DashboardCharts>('/dashboard/charts', { params: { agrupacion } }).then((r) => r.data),
  ordersOfTheDay: (fecha: string) =>
    http.get<DayOrders>('/dashboard/orders-day', { params: { fecha } }).then((r) => r.data),
  lowStock: () => http.get<LowStockProduct[]>('/dashboard/low-stock').then((r) => r.data),
  /** Work orders not finalized whose delivery time already passed, the most overdue first. */
  overdueOrders: () => http.get<WorkOrderListItem[]>('/dashboard/overdue-orders').then((r) => r.data),
  // Statistics: only the ADMIN role.
  topProducts: () => http.get<TopProduct[]>('/dashboard/top-products').then((r) => r.data),
  stockValue: () => http.get<StockValue>('/dashboard/stock-value').then((r) => r.data),
  topBrands: () => http.get<BrandOrders[]>('/dashboard/top-brands').then((r) => r.data),
  entryReasons: () => http.get<EntryReasonCount[]>('/dashboard/entry-reasons').then((r) => r.data),
};
