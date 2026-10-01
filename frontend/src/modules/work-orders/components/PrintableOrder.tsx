import { createPortal } from 'react-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { formatDate, formatDateTime, formatOrderNumber, formatWarrantyDays, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import type { WorkOrder } from '../types';
import { useOrderQr } from './OrderQr';

const LOCK_LABELS = { NINGUNO: 'Sin bloqueo', PATRON: 'Patrón registrado', PIN: 'PIN registrado' } as const;

/**
 * Printable sheet of the order (hidden on screen, the only thing printed by window.print).
 * The unlock pattern / PIN is not printed: the sheet is handed to the client.
 */
export function PrintableOrder({ order }: { order: WorkOrder }) {
  const { url, image } = useOrderQr(order.codigo_publico);
  const { user } = useAuth();
  // Technician of the order (the user who registered it); orders without one show the logged user.
  const technician = order.tecnico ?? user;
  // Rendered directly in <body>: when printing, everything else is hidden.
  return createPortal(
    <section className="print-sheet" aria-hidden="true">
      <header className="print-header">
        <div>
          <h1>MobileZone</h1>
          <p>Orden de trabajo</p>
        </div>
        <div className="print-number">
          <strong>N.º {formatOrderNumber(order.num_orden)}</strong>
          <span>Ingreso: {formatDate(order.fecha)}</span>
          <span>Entrega: {order.fecha_entrega ? formatDateTime(order.fecha_entrega) : 'Por confirmar'}</span>
        </div>
      </header>

      <div className="print-grid">
        <div>
          <h2>Cliente</h2>
          <dl>
            <dt>Cédula / RUC</dt>
            <dd>{order.cliente.identificacion ?? '—'}</dd>
            <dt>Nombre</dt>
            <dd>{fullName(order.cliente)}</dd>
            <dt>Celular</dt>
            <dd>{order.cliente.celular ?? '—'}</dd>
            <dt>Email</dt>
            <dd>{order.cliente.email ?? '—'}</dd>
          </dl>
        </div>
        <div>
          <h2>Equipo</h2>
          <dl>
            <dt>Marca / Modelo</dt>
            <dd>
              {order.marca.nombre} {order.modelo.nombre}
            </dd>
            <dt>Modelo técnico</dt>
            <dd>{order.modelo_tecnico ?? '—'}</dd>
            <dt>Color</dt>
            <dd>{order.color ?? '—'}</dd>
            <dt>Motivo de ingreso</dt>
            <dd>
              {order.motivo_ingreso_label}
              {order.tipo_display ? ` (${order.tipo_display})` : ''}
            </dd>
            <dt>Desbloqueo</dt>
            <dd>{LOCK_LABELS[order.bloqueo_tipo]}</dd>
          </dl>
        </div>
      </div>

      <h2>Observaciones</h2>
      <p className="pre-line">{order.observacion ?? '—'}</p>

      <div className="print-grid">
        <dl>
          <dt>Costo de reparación</dt>
          <dd>{formatMoney(order.presupuesto)}</dd>
          <dt>Anticipo</dt>
          <dd>{formatMoney(order.anticipo)}</dd>
          <dt>Saldo</dt>
          <dd>
            <strong>{formatMoney(order.saldo)}</strong>
          </dd>
          <dt>Garantía</dt>
          <dd>{formatWarrantyDays(order.garantia_dias)}</dd>
          <dt>Estado</dt>
          <dd>{order.estado_label}</dd>
          <dt>Técnico</dt>
          <dd>{fullName(technician)}</dd>
        </dl>
        <div className="print-qr">
          {image && <img src={image} alt="" />}
          <small>Consulte el estado de su orden:</small>
          <small className="print-url">{url}</small>
        </div>
      </div>

      <footer className="print-signatures">
        <span>Firma del cliente</span>
        <span>Recibido por: {fullName(order.user)}</span>
      </footer>
    </section>,
    document.body,
  );
}
