import { useQuery, type UseQueryResult } from '@tanstack/react-query';
import { useId, useState, type ReactNode } from 'react';
import { BarList } from '@/modules/dashboard/components/BarList';
import { DASHBOARD_KEY, dashboardApi } from '@/modules/dashboard/services/dashboardApi';
import { EmptyState, ErrorState, Loading, Modal } from '@/shared/components';

type Tab = 'marcas' | 'motivos';

const TABS: { value: Tab; label: string }[] = [
  { value: 'marcas', label: '10 marcas con más ingresos' },
  { value: 'motivos', label: 'Motivos de ingreso' },
];

const orders = (n: number) => `${n} ${n === 1 ? 'orden' : 'órdenes'}`;

function QueryContent<T>({ query, children }: { query: UseQueryResult<T[]>; children: (rows: T[]) => ReactNode }) {
  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (!query.data.length) return <EmptyState title="Todavía no hay órdenes de trabajo" />;
  return <>{children(query.data)}</>;
}

/** Órdenes → Estadística (admin): brands with the most work orders and orders per entry reason. */
export function WorkOrderStatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>('marcas');
  const id = useId();
  const brands = useQuery({
    queryKey: [DASHBOARD_KEY, 'top-brands'],
    queryFn: dashboardApi.topBrands,
    enabled: open && tab === 'marcas',
  });
  const reasons = useQuery({
    queryKey: [DASHBOARD_KEY, 'entry-reasons'],
    queryFn: dashboardApi.entryReasons,
    enabled: open && tab === 'motivos',
  });

  return (
    <Modal open={open} title="Estadística de órdenes" onClose={onClose} size="lg">
      <div className="tabs" role="tablist" aria-label="Estadísticas">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            id={`${id}-${t.value}`}
            aria-selected={tab === t.value}
            aria-controls={`${id}-${t.value}-panel`}
            className={tab === t.value ? 'active' : ''}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-${tab}-panel`} aria-labelledby={`${id}-${tab}`} className="tab-panel">
        {tab === 'marcas' ? (
          <QueryContent query={brands}>
            {(rows) => (
              <BarList
                ariaLabel="Marcas con más órdenes de trabajo"
                format={orders}
                data={rows.map((b) => ({ key: b.id, label: b.nombre, value: b.ordenes }))}
              />
            )}
          </QueryContent>
        ) : (
          <QueryContent query={reasons}>
            {(rows) => (
              <>
                <BarList
                  ariaLabel="Órdenes por motivo de ingreso"
                  color="var(--chart-series-2)"
                  format={orders}
                  data={rows.map((r) => ({ key: r.motivo, label: r.etiqueta, value: r.ordenes }))}
                />
                <p className="muted">Una orden con varios motivos cuenta en cada uno.</p>
              </>
            )}
          </QueryContent>
        )}
      </div>
    </Modal>
  );
}
