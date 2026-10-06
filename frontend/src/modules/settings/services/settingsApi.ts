import { http } from '@/shared/services/httpClient';

/** Rows deleted per module (ordenes, ventas, productos, clientes, ...). */
export type ResetDataResult = { eliminados: Record<string, number> };

export const settingsApi = {
  resetData: (confirmacion: string) =>
    http.post<ResetDataResult>('/settings/reset-data', { confirmacion }).then((r) => r.data),
};
