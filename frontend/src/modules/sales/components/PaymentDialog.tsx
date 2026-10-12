import { useId, useState, type ReactNode } from 'react';
import { Button, MoneyInput, Modal } from '@/shared/components';
import type { Money } from '@/shared/types/api';
import { formatMoney, isValidMoney, normalizeMoney, toCents } from '@/shared/utils/money';
import { CARD_SURCHARGE_PERCENT, calculatePayment } from '../payment';
import { PAYMENT_METHOD_LABELS, type PaymentMethod } from '../types';

export interface PaymentResult {
  metodo_pago: PaymentMethod;
  monto_recibido: Money | null;
  /** Only when the dialog allows a discount. */
  descuento?: Money;
}

interface Props {
  total: Money;
  title?: string;
  confirmLabel?: string;
  initialMethod?: PaymentMethod | null;
  /** Shows the "Descuento" field (sales); the computed total is shown after it. */
  allowDiscount?: boolean;
  initialDiscount?: Money | null;
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

/** "0.00" (no discount) is shown as an empty field. */
const discountText = (value: Money | null | undefined) => (value && toCents(value) > 0 ? normalizeMoney(value) : '');

/**
 * Sale confirmation: amount to pay, payment method (credit card +6 %), optional discount,
 * and for cash the amount received with the change to give back.
 */
export function PaymentDialog({
  total,
  title = 'Confirmar venta',
  confirmLabel = 'Confirmar venta',
  initialMethod,
  allowDiscount = false,
  initialDiscount,
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
  const [descuento, setDescuento] = useState(() => discountText(initialDiscount));
  const descuentoFormatoInvalido = descuento.trim() !== '' && !isValidMoney(descuento);
  const descuentoExcede = !descuentoFormatoInvalido && toCents(descuento) > toCents(total);
  const descuentoValido = allowDiscount && !descuentoFormatoInvalido && !descuentoExcede ? descuento : '';
  const payment = calculatePayment(total, metodo, recibido, descuentoValido || '0');
  const conDescuento = toCents(descuentoValido) > 0;
  const recibidoInvalido = metodo === 'EFECTIVO' && recibido.trim() !== '' && !isValidMoney(recibido);
  const blocked =
    recibidoInvalido ||
    payment.insuficiente ||
    confirmDisabled ||
    (allowDiscount && (descuentoFormatoInvalido || descuentoExcede));

  const confirm = () => {
    if (blocked) return;
    onConfirm({
      metodo_pago: metodo,
      monto_recibido: metodo === 'EFECTIVO' && recibido.trim() ? normalizeMoney(recibido) : null,
      ...(allowDiscount ? { descuento: normalizeMoney(descuentoValido || '0') } : {}),
    });
  };

  const totalBox = (
    <div className="payment-total">
      <span>{totalLabel}</span>
      <strong data-testid="payment-total">{formatMoney(payment.totalPagar)}</strong>
    </div>
  );

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
        {!allowDiscount && totalBox}
        {!allowDiscount && metodo === 'TARJETA' && (
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

        {allowDiscount && (
          <>
            <MoneyInput
              label="Descuento (USD)"
              value={descuento}
              placeholder="0.00"
              onChange={(e) => setDescuento(e.target.value)}
              hint="Se resta del subtotal y aparece en el comprobante / factura."
              error={
                descuentoFormatoInvalido
                  ? 'Monto inválido'
                  : descuentoExcede
                    ? 'El descuento no puede ser mayor que el subtotal'
                    : undefined
              }
            />
            <dl className="payment-breakdown" data-testid="payment-breakdown">
              <dt>Subtotal</dt>
              <dd>{formatMoney(total)}</dd>
              {conDescuento && (
                <>
                  <dt>Descuento</dt>
                  <dd>- {formatMoney(descuentoValido)}</dd>
                </>
              )}
              {metodo === 'TARJETA' && (
                <>
                  <dt>Recargo tarjeta {CARD_SURCHARGE_PERCENT} %</dt>
                  <dd>{formatMoney(payment.recargo)}</dd>
                </>
              )}
            </dl>
            {totalBox}
          </>
        )}

        {metodo === 'EFECTIVO' && (
          <div className="cash-row">
            <MoneyInput
              label="Monto recibido"
              value={recibido}
              autoFocus={!allowDiscount}
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
