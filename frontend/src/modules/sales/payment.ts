import type { Money } from '@/shared/types/api';
import { fromCents, toCents } from '@/shared/utils/money';
import type { PaymentMethod } from './types';

/** Credit card surcharge on the final price: 6 % (same rule as the backend). */
export const CARD_SURCHARGE_PERCENT = 6;

export interface PaymentSummary {
  /** credit card surcharge */
  recargo: Money;
  /** amount to pay = total + recargo */
  totalPagar: Money;
  /** cash: change to give back; null when not applicable or not enough money */
  cambio: Money | null;
  /** cash: the received amount does not cover the amount to pay */
  insuficiente: boolean;
}

/** Visual calculation of the payment. The backend recalculates and validates it. */
export function calculatePayment(total: Money, metodo: PaymentMethod, recibido?: string): PaymentSummary {
  const totalCents = toCents(total);
  const recargoCents = metodo === 'TARJETA' ? Math.round((totalCents * CARD_SURCHARGE_PERCENT) / 100) : 0;
  const pagarCents = totalCents + recargoCents;
  let cambio: Money | null = null;
  let insuficiente = false;
  if (metodo === 'EFECTIVO' && recibido !== undefined && recibido.trim() !== '') {
    const recibidoCents = toCents(recibido);
    insuficiente = recibidoCents < pagarCents;
    cambio = insuficiente ? null : fromCents(recibidoCents - pagarCents);
  }
  return { recargo: fromCents(recargoCents), totalPagar: fromCents(pagarCents), cambio, insuficiente };
}
