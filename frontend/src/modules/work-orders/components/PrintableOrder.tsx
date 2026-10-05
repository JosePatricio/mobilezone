import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { formatDate, formatDateTime, formatOrderNumber, formatWarrantyDays, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import type { WorkOrder } from '../types';
import { useOrderQr } from './OrderQr';

const LOCK_LABELS = { NINGUNO: 'Sin bloqueo', PATRON: 'Patrón registrado', PIN: 'PIN registrado' } as const;

/** One receipt line: label on the left, value aligned to the right (wraps below when long). */
function Row({ label, children, strong }: { label: string; children: ReactNode; strong?: boolean }) {
  return (
    <div className={strong ? 'receipt-row receipt-strong' : 'receipt-row'}>
      <span>{label}</span>
      <span>{children}</span>
    </div>
  );
}

/**
 * Printable receipt of the order for an 80 mm thermal printer (hidden on screen, the only thing
 * printed by window.print). The unlock pattern / PIN is not printed: the receipt is handed to the client.
 */
export function PrintableOrder({ order }: { order: WorkOrder }) {
  const { url, image } = useOrderQr(order.codigo_publico);
  const { user } = useAuth();
  // Technician of the order (the user who registered it); orders without one show the logged user.
  const technician = order.tecnico ?? user;
  // Rendered directly in <body>: when printing, everything else is hidden.
  return createPortal(
    <section className="print-sheet" aria-hidden="true">
      <header className="receipt-center">
        <h1>MobileZone</h1>
        <p>Orden de trabajo</p>
        <p className="receipt-strong">N.º {formatOrderNumber(order.num_orden)}</p>
      </header>
      <Row label="Ingreso">{formatDate(order.fecha)}</Row>
      <Row label="Entrega">{order.fecha_entrega ? formatDateTime(order.fecha_entrega) : 'Por confirmar'}</Row>

      <h2>Cliente</h2>
      <Row label="Cédula/RUC">{order.cliente.identificacion ?? '—'}</Row>
      <Row label="Nombre">{fullName(order.cliente)}</Row>
      <Row label="Celular">{order.cliente.celular ?? '—'}</Row>
      <Row label="Email">{order.cliente.email ?? '—'}</Row>

      <h2>Equipo</h2>
      <Row label="Marca/Modelo">
        {order.marca.nombre} {order.modelo.nombre}
      </Row>
      <Row label="Mod. técnico">{order.modelo_tecnico ?? '—'}</Row>
      <Row label="Color">{order.color ?? '—'}</Row>
      <Row label="Motivo">
        {order.motivo_ingreso_label}
        {order.tipo_display ? ` (${order.tipo_display})` : ''}
      </Row>
      <Row label="Desbloqueo">{LOCK_LABELS[order.bloqueo_tipo]}</Row>

      <h2>Observaciones</h2>
      <p className="pre-line">{order.observacion ?? '—'}</p>

      <hr />
      <Row label="Costo de reparación">{formatMoney(order.presupuesto)}</Row>
      <Row label="Anticipo">{formatMoney(order.anticipo)}</Row>
      <Row label="SALDO" strong>
        {formatMoney(order.saldo)}
      </Row>
      <hr />
      <Row label="Garantía">{formatWarrantyDays(order.garantia_dias)}</Row>
      <Row label="Estado">{order.estado_label}</Row>
      <Row label="Vendedor">{fullName(technician)}</Row>

      <div className="receipt-center print-qr">
        {image && <img src={image} alt="" />}
        <small>Consulte el estado de su orden:</small>
        <small className="print-url">{url}</small>
      </div>

      <footer className="print-signatures">
        <span>Firma del cliente</span>
        <span>Recibido por: {fullName(order.user)}</span>
      </footer>
    </section>,
    document.body,
  );
}
