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

export const DASHBOARD_KEY = 'dashboard';

export const dashboardApi = {
  charts: (agrupacion: Grouping) =>
    http.get<DashboardCharts>('/dashboard/charts', { params: { agrupacion } }).then((r) => r.data),
  ordersOfTheDay: (fecha: string) =>
    http.get<DayOrders>('/dashboard/orders-day', { params: { fecha } }).then((r) => r.data),
};
