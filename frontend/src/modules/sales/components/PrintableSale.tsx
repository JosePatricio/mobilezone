import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { LOGO_URL } from '@/shared/components';
import { formatDateTime, formatOrderNumber, fullName } from '@/shared/utils/format';
import { formatMoney, toCents } from '@/shared/utils/money';
import { CARD_SURCHARGE_PERCENT } from '../payment';
import { CONSUMIDOR_FINAL, customerName, type Sale } from '../types';

/** Printed instead of the payment data (Pago / Recibido / Cambio). */
export const NO_RETURNS_NOTICE = 'Salida la mercadería no se aceptan devoluciones';

/** One receipt line: label on the left, value aligned to the right (wraps below when long). */
function Row({ label, children, strong }: { label: ReactNode; children: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'receipt-row receipt-strong' : 'receipt-row'}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/** Content of the sale receipt (comprobante / factura) for an 80 mm thermal printer. */
export function SaleReceipt({ sale }: { sale: Sale }) {
  const { branch, cliente } = sale;
  return (
    <>
      <header className="receipt-center">
        <img src={LOGO_URL} alt="MobileZone" className="receipt-logo" />
        <h1>MobileZone</h1>
        <div className="receipt-contact">
          <p>{branch.nombre}</p>
          <p>{branch.direccion ?? branch.ubicacion}</p>
          {branch.telefono && <p>Tel.: {branch.telefono}</p>}
        </div>
        <p>{sale.factura ? 'Factura' : 'Comprobante de venta'}</p>
        <p className="receipt-strong">N.º {String(sale.id).padStart(6, '0')}</p>
        {sale.estado === 'ANULADA' && <p className="receipt-strong">VENTA ANULADA</p>}
      </header>
      <Row label="Fecha">{formatDateTime(sale.fecha)}</Row>
      <Row label="Vendedor">{fullName(sale.user)}</Row>

      <h2>Cliente</h2>
      {cliente ? (
        <>
          <Row label="Nombre">{customerName(cliente)}</Row>
          <Row label="Cédula/RUC">{cliente.identificacion ?? '—'}</Row>
          <Row label="Celular">{cliente.celular ?? '—'}</Row>
        </>
      ) : (
        <p>{CONSUMIDOR_FINAL}</p>
      )}

      <h2>Detalle</h2>
      {sale.work_order && (
        <div className="receipt-item">
          <p>Reparación · Orden N.º {formatOrderNumber(sale.work_order.num_orden)}</p>
          <Row label={`1 x ${formatMoney(sale.total)}`}>{formatMoney(sale.total)}</Row>
        </div>
      )}
      {sale.details.map((d) => (
        <div key={d.id} className="receipt-item">
          <p>
            {d.product.nombre} <small>({d.product.sku})</small>
            {d.por_mayor && <small> · Precio por mayor</small>}
          </p>
          <Row label={`${d.cantidad} x ${formatMoney(d.precio_unitario)}`}>{formatMoney(d.subtotal)}</Row>
        </div>
      ))}

      <hr />
      <Row label="Descuento">
        {toCents(sale.descuento) > 0 ? `- ${formatMoney(sale.descuento)}` : formatMoney(0)}
      </Row>
      <Row label="Subtotal">{formatMoney(sale.total)}</Row>
      {toCents(sale.recargo) > 0 && (
        <Row label={`Recargo tarjeta (${CARD_SURCHARGE_PERCENT} %)`}>{formatMoney(sale.recargo)}</Row>
      )}
      <Row label="TOTAL A PAGAR" strong>
        {formatMoney(sale.total_pagar)}
      </Row>
      <hr />
      <p className="receipt-center receipt-strong">{NO_RETURNS_NOTICE}</p>

      <footer className="receipt-center receipt-footer">
        <p>¡Gracias por su compra!</p>
        <small>Documento interno de venta. No reemplaza al comprobante electrónico autorizado por el SRI.</small>
      </footer>
    </>
  );
}

/**
 * Printable receipt of the sale (hidden on screen, the only thing printed by window.print),
 * same 80 mm thermal format as the work orders.
 */
export function PrintableSale({ sale }: { sale: Sale }) {
  // Rendered directly in <body>: when printing, everything else is hidden.
  return createPortal(
    <section className="print-sheet" aria-hidden="true">
      <SaleReceipt sale={sale} />
    </section>,
    document.body,
  );
}
