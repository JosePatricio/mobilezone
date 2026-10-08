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

export const DASHBOARD_KEY = 'dashboard';

export const dashboardApi = {
  charts: (agrupacion: Grouping) =>
    http.get<DashboardCharts>('/dashboard/charts', { params: { agrupacion } }).then((r) => r.data),
};
