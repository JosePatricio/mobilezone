import { http } from '@/shared/services/httpClient';
import type { Money } from '@/shared/types/api';
import { toCents } from '@/shared/utils/money';

/** Daily sales goals of the header: below `baja` 😞, up to `alta` 😊, above `alta` 🤑. */
export interface SalesGoals {
  baja: Money;
  alta: Money;
}

export const SETTINGS_KEY = 'settings';

export const settingsApi = {
  salesGoals: () => http.get<SalesGoals>('/settings/sales-goals').then((r) => r.data),
  updateSalesGoals: (body: SalesGoals) => http.put<SalesGoals>('/settings/sales-goals', body).then((r) => r.data),
};

/** Emoji of the amount sold today against the goals. */
export function salesMood(total: Money | number, goals: SalesGoals): { emoji: string; label: string } {
  const cents = toCents(total);
  if (cents < toCents(goals.baja)) return { emoji: '😞', label: 'Por debajo de la meta' };
  if (cents <= toCents(goals.alta)) return { emoji: '😊', label: 'Meta alcanzada' };
  return { emoji: '🤑', label: 'Meta superada' };
}
