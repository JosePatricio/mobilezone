import { useQuery } from '@tanstack/react-query';
import { DASHBOARD_KEY, dashboardApi } from '@/modules/dashboard/services/dashboardApi';
import { ErrorState, Loading, Modal } from '@/shared/components';
import { formatMoney } from '@/shared/utils/money';

/** Productos → Resumen (admin): value of the total stock at PVP (activo neto) and at cost (activo bruto). */
export function StockValueModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  // Always fresh: the stock changes with every sale.
  const query = useQuery({
    queryKey: [DASHBOARD_KEY, 'stock-value'],
    queryFn: dashboardApi.stockValue,
    enabled: open,
    staleTime: 0,
  });

  return (
    <Modal open={open} title="Resumen de productos" onClose={onClose} size="md">
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <>
          <div className="stat-grid stat-grid-2">
            <div className="stat-card stat-success">
              <span className="stat-label">Activo neto</span>
              <span className="stat-value">{formatMoney(query.data.activo_neto)}</span>
              <small className="muted">Σ PVP × stock total</small>
            </div>
            <div className="stat-card stat-info">
              <span className="stat-label">Activo bruto</span>
              <span className="stat-value">{formatMoney(query.data.activo_bruto)}</span>
              <small className="muted">Σ costo × stock total</small>
            </div>
          </div>
          <p className="muted">Calculado con el stock de todas las sucursales.</p>
        </>
      )}
    </Modal>
  );
}
