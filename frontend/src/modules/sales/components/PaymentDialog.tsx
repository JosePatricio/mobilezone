import { useId, useState, type ReactNode } from 'react';
import { Button, MoneyInput, Modal } from '@/shared/components';
import type { Money } from '@/shared/types/api';
import { formatMoney, isValidMoney, normalizeMoney } from '@/shared/utils/money';
import { CARD_SURCHARGE_PERCENT, calculatePayment } from '../payment';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../types';

export interface PaymentResult {
  metodo_pago: PaymentMethod;
  monto_recibido: Money | null;
}

interface Props {
  total: Money;
  title?: string;
  confirmLabel?: string;
  initialMethod?: PaymentMethod | null;
  loading?: boolean;
  /** Summary of the operation, shown at the bottom as a small footer. */
  children: ReactNode;
  /** Content shown above the amount (e.g. a warning or extra fields). */
  header?: ReactNode;
  /** Label of the amount to collect (default "Total a pagar"). */
  totalLabel?: string;
  /** Blocks the confirmation (e.g. a required field outside the dialog is missing). */
  confirmDisabled?: boolean;
  onCancel: () => void;
  onConfirm: (payment: PaymentResult) => void;
}

const METHODS: PaymentMethod[] = ['TRANSFERENCIA', 'EFECTIVO', 'TARJETA'];

/**
 * Sale confirmation: amount to pay, payment method (credit card +6 %), and for cash
 * the amount received with the change to give back.
 */
export function PaymentDialog({
  total,
  title = 'Confirmar venta',
  confirmLabel = 'Confirmar venta',
  initialMethod,
  loading = false,
  children,
  header,
  totalLabel = 'Total a pagar',
  confirmDisabled = false,
  onCancel,
  onConfirm,
}: Props) {
  const groupId = useId();
  const [metodo, setMetodo] = useState<PaymentMethod>(initialMethod ?? 'EFECTIVO');
  const [recibido, setRecibido] = useState('');
  const payment = calculatePayment(total, metodo, recibido);
  const recibidoInvalido = metodo === 'EFECTIVO' && recibido.trim() !== '' && !isValidMoney(recibido);
  const blocked = recibidoInvalido || payment.insuficiente || confirmDisabled;

  const confirm = () => {
    if (blocked) return;
    onConfirm({
      metodo_pago: metodo,
      monto_recibido: metodo === 'EFECTIVO' && recibido.trim() ? normalizeMoney(recibido) : null,
    });
  };

  return (
    <Modal
      open
      role="alertdialog"
      title={title}
      onClose={onCancel}
      dismissible={!loading}
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={loading}>
            Cancelar
          </Button>
          <Button onClick={confirm} disabled={blocked} loading={loading}>
            {confirmLabel}
          </Button>
        </>
      }
    >
      <div className="payment">
        {header}
        <div className="payment-total">
          <span>{totalLabel}</span>
          <strong data-testid="payment-total">{formatMoney(payment.totalPagar)}</strong>
        </div>
        {metodo === 'TARJETA' && (
          <p className="payment-detail">
            Subtotal {formatMoney(total)} + recargo tarjeta {CARD_SURCHARGE_PERCENT} % ({formatMoney(payment.recargo)})
          </p>
        )}

        <fieldset className="payment-methods" aria-labelledby={`${groupId}-label`}>
          <legend id={`${groupId}-label`} className="field-label">
            Método de pago
          </legend>
          {METHODS.map((m) => (
            <label key={m} className={`payment-method ${metodo === m ? 'selected' : ''}`}>
              <input
                type="radio"
                name={`${groupId}-metodo`}
                value={m}
                checked={metodo === m}
                onChange={() => setMetodo(m)}
              />
              {PAYMENT_METHOD_LABELS[m]}
              {m === 'TARJETA' && <small className="muted"> (+{CARD_SURCHARGE_PERCENT} %)</small>}
            </label>
          ))}
        </fieldset>

        {metodo === 'EFECTIVO' && (
          <div className="cash-row">
            <MoneyInput
              label="Monto recibido"
              value={recibido}
              autoFocus
              onChange={(e) => setRecibido(e.target.value)}
              error={
                recibidoInvalido
                  ? 'Monto inválido'
                  : payment.insuficiente
                    ? 'El monto recibido no cubre el total'
                    : undefined
              }
            />
            <div className="field">
              <span className="field-label">Cambio / vuelto</span>
              <p className="cash-change" data-testid="payment-change">
                {payment.cambio !== null ? formatMoney(payment.cambio) : '—'}
              </p>
            </div>
          </div>
        )}

        <div className="payment-footer">{children}</div>
      </div>
    </Modal>
  );
}
