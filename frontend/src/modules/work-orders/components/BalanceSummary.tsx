import type { Money } from '@/shared/types/api';
import { calculateBalance, formatMoney, toCents } from '@/shared/utils/money';

interface Props {
  presupuesto: Money;
  anticipo: Money;
  /** Definitive value from the backend; when absent it is computed visually. */
  saldo?: Money;
}

/**
 * Costo de reparación:  $100
 * Anticipo:      $30
 * ------------------
 * Saldo:         $70
 */
export function BalanceSummary({ presupuesto, anticipo, saldo }: Props) {
  const value = saldo ?? calculateBalance(presupuesto, anticipo);
  const invalid = toCents(value) < 0;
  return (
    <dl className="balance" aria-label="Resumen de valores">
      <dt>Costo de reparación</dt>
      <dd>{formatMoney(presupuesto)}</dd>
      <dt>Anticipo</dt>
      <dd>{formatMoney(anticipo)}</dd>
      <dt className="balance-total">Saldo</dt>
      <dd className={`balance-total ${invalid ? 'text-danger' : ''}`} data-testid="balance-saldo">
        {formatMoney(value)}
      </dd>
    </dl>
  );
}
