import { http } from '@/shared/services/httpClient';
import type { OrderClient } from '../types';

export const MARKETING_KEY = 'marketing';

export const marketingApi = {
  /** Active clients with at least one work order (not the ones that only bought in Ventas). */
  recipients: () => http.get<OrderClient[]>('/marketing/recipients').then((r) => r.data),
};
