import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Card, ErrorState, Loading, StatusBadge } from '@/shared/components';
import { toApiError } from '@/shared/services/apiError';
import { formatDate, formatDateTime, formatOrderNumber, formatWarrantyDays } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { statusTone } from '../hooks/useWorkOrderStatuses';
import { workOrderApi } from '../services/workOrderApi';

/** Public status page opened from the QR of the order (no login). */
export function PublicWorkOrderPage() {
  const codigo = useParams().codigo ?? '';
  const query = useQuery({
    queryKey: ['public-work-order', codigo],
    queryFn: () => workOrderApi.publicStatus(codigo),
    refetchInterval: 60_000,
  });

  const notFound = query.isError && toApiError(query.error).status === 404;
  const order = query.data;

  return (
    <div className="public-page">
      <div className="public-card">
        <div className="app-brand">
          <span className="brand-mark" aria-hidden>
            MZ
          </span>
          <span>MobileZone</span>
        </div>
        {query.isLoading ? (
          <Loading />
        ) : notFound ? (
          <Card title="Orden no encontrada">
            <p className="muted">El enlace no corresponde a ninguna orden de trabajo.</p>
          </Card>
        ) : query.isError || !order ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <Card title={`Orden #${formatOrderNumber(order.num_orden)}`}>
            <dl className="detail-list">
              <dt>Estado</dt>
              <dd>
                <StatusBadge label={order.estado_label} tone={statusTone(order.estado)} />
              </dd>
              <dt>Equipo</dt>
              <dd>
                {order.marca.nombre} {order.modelo.nombre}
                {order.color ? ` · ${order.color}` : ''}
              </dd>
              <dt>Motivo de ingreso</dt>
              <dd>
                {order.motivo_ingreso_label}
                {order.tipo_display ? ` (${order.tipo_display})` : ''}
              </dd>
              <dt>Fecha de ingreso</dt>
              <dd>{formatDate(order.fecha)}</dd>
              <dt>Fecha de entrega</dt>
              <dd>{order.fecha_entrega ? formatDateTime(order.fecha_entrega) : 'Por confirmar'}</dd>
              <dt>Garantía</dt>
              <dd>{formatWarrantyDays(order.garantia_dias)}</dd>
              <dt>Costo de reparación</dt>
              <dd>{formatMoney(order.presupuesto)}</dd>
              <dt>Anticipo</dt>
              <dd>{formatMoney(order.anticipo)}</dd>
              <dt>Saldo</dt>
              <dd>
                <strong>{formatMoney(order.saldo)}</strong>
              </dd>
            </dl>
            <p className="field-hint">Última actualización: {formatDateTime(order.updated_at)}</p>
          </Card>
        )}
      </div>
    </div>
  );
}
