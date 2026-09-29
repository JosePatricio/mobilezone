import type { Money } from '@/shared/types/api';

/**
 * Money helpers. Arithmetic is done in integer cents to avoid floating point
 * errors; values are only converted back to decimal strings for display / API.
 */

export function toCents(value: Money | number | null | undefined): number {
  if (value === null || value === undefined || value === '') return 0;
  const num = typeof value === 'number' ? value : Number(String(value).replace(',', '.'));
  return Number.isFinite(num) ? Math.round(num * 100) : 0;
}

export function fromCents(cents: number): Money {
  const sign = cents < 0 ? '-' : '';
  const abs = Math.abs(Math.round(cents));
  return `${sign}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
}

export function multiplyMoney(value: Money | number, quantity: number): number {
  return toCents(value) * quantity;
}

/** saldo = presupuesto - anticipo (visual only; the backend computes the definitive value). */
export function calculateBalance(presupuesto: Money | number, anticipo: Money | number): Money {
  return fromCents(toCents(presupuesto) - toCents(anticipo));
}

const formatter = new Intl.NumberFormat('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export function formatMoney(value: Money | number | null | undefined): string {
  return `$ ${formatter.format(toCents(value) / 100)}`;
}

export function isValidMoney(value: string): boolean {
  return /^\d+([.,]\d{1,2})?$/.test(value.trim());
}

export function normalizeMoney(value: string): Money {
  return fromCents(toCents(value));
}
