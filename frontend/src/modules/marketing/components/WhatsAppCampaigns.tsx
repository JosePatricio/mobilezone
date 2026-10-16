import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Button, Card, ErrorState, Loading, Modal, StatusBadge } from '@/shared/components';
import { formatDateTime } from '@/shared/utils/format';
import { MARKETING_KEY, marketingApi } from '../services/marketingApi';
import type { Campaign, MessageStatus } from '../types';

/** While a campaign is being sent (or Meta reports its states) the lists refresh by themselves. */
const REFRESH_MS = 4000;

const STATUS: Record<MessageStatus, { label: string; tone: 'success' | 'neutral' | 'warning' | 'danger' | 'info' }> = {
  PENDIENTE: { label: 'Pendiente', tone: 'warning' },
  ENVIADO: { label: 'Enviado', tone: 'neutral' },
  ENTREGADO: { label: 'Entregado', tone: 'info' },
  LEIDO: { label: 'Leído', tone: 'success' },
  FALLIDO: { label: 'Fallido', tone: 'danger' },
};

/** Campaigns sent through the WhatsApp Cloud API, with how many messages are in each state. */
export function WhatsAppCampaigns() {
  const [openId, setOpenId] = useState<number | null>(null);
  const query = useQuery({
    queryKey: [MARKETING_KEY, 'campaigns'],
    queryFn: marketingApi.campaigns,
    refetchInterval: (q) => (q.state.data?.some((c) => c.pendientes > 0) ? REFRESH_MS : false),
  });

  if (query.isLoading) return null;
  if (query.isError) {
    return (
      <Card title="Campañas de WhatsApp">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </Card>
    );
  }
  const campaigns = query.data ?? [];
  if (campaigns.length === 0) return null;

  return (
    <Card
      title="Campañas de WhatsApp"
      actions={
        <Button variant="ghost" size="sm" onClick={() => query.refetch()} loading={query.isFetching}>
          Actualizar
        </Button>
      }
    >
      <div className="table-wrapper">
        <table className="table">
          <thead>
            <tr>
              <th>Fecha</th>
              <th>Plantilla</th>
              <th>Enviada por</th>
              <th className="text-right">Total</th>
              <th className="text-right">Pendientes</th>
              <th className="text-right">Entregados</th>
              <th className="text-right">Leídos</th>
              <th className="text-right">Fallidos</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {campaigns.map((c) => (
              <tr key={c.id}>
                <td>{formatDateTime(c.created_at)}</td>
                <td>
                  {c.plantilla} <span className="muted">{c.idioma}</span>
                </td>
                <td>{c.creado_por ?? '—'}</td>
                <td className="text-right">{c.total}</td>
                <td className="text-right">{c.pendientes}</td>
                {/* "Leído" implies delivered: the delivered column counts both. */}
                <td className="text-right">{c.entregados + c.leidos}</td>
                <td className="text-right">{c.leidos}</td>
                <td className="text-right">{c.fallidos}</td>
                <td className="text-right">
                  <Button variant="ghost" size="sm" onClick={() => setOpenId(c.id)}>
                    Ver
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="field-hint">
        Entregado y leído llegan desde WhatsApp unos segundos después del envío (requiere el webhook configurado). Los
        clientes que responden BAJA no reciben más campañas; con ALTA vuelven a recibirlas.
      </p>
      {openId !== null && (
        <CampaignModal id={openId} summary={campaigns.find((c) => c.id === openId)} onClose={() => setOpenId(null)} />
      )}
    </Card>
  );
}

function CampaignModal({ id, summary, onClose }: { id: number; summary?: Campaign; onClose: () => void }) {
  const query = useQuery({
    queryKey: [MARKETING_KEY, 'campaigns', id],
    queryFn: () => marketingApi.campaign(id),
    refetchInterval: (q) => (q.state.data?.campaign.pendientes ? REFRESH_MS : false),
  });

  return (
    <Modal open title={`Campaña ${summary?.plantilla ?? ''}`} onClose={onClose} size="lg">
      {query.isLoading ? (
        <Loading />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Cliente</th>
                <th>Celular</th>
                <th>Estado</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {query.data!.messages.map((m) => (
                <tr key={m.id}>
                  <td>
                    {m.cliente ?? <span className="muted">{m.cliente_id ? 'Cliente eliminado' : 'Número manual'}</span>}
                  </td>
                  <td>+{m.telefono}</td>
                  <td>
                    <StatusBadge label={STATUS[m.estado].label} tone={STATUS[m.estado].tone} />
                  </td>
                  <td className="wa-error">{m.error ?? <span className="muted">{formatDateTime(m.updated_at)}</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Modal>
  );
}
