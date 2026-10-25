import { useQuery } from '@tanstack/react-query';
import { BarList } from '@/modules/dashboard/components/BarList';
import { DASHBOARD_KEY, dashboardApi } from '@/modules/dashboard/services/dashboardApi';
import { EmptyState, ErrorState, Loading, Modal } from '@/shared/components';
import { formatMoney } from '@/shared/utils/money';

const plural = (n: number) => `${n} ${n === 1 ? 'unidad' : 'unidades'}`;

/** Ventas → Estadística (admin): the 10 products with the most units sold in confirmed sales. */
export function SalesStatsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const query = useQuery({ queryKey: [DASHBOARD_KEY, 'top-products'], queryFn: dashboardApi.topProducts, enabled: open });

  return (
    <Modal open={open} title="Estadística: 10 productos más vendidos" onClose={onClose} size="lg">
      {query.isLoading ? (
        <Loading />
      ) : query.isError || !query.data ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data.length ? (
        <EmptyState title="Todavía no hay ventas confirmadas" />
      ) : (
        <BarList
          ariaLabel="Productos más vendidos (unidades)"
          format={plural}
          data={query.data.map((p) => ({
            key: p.id,
            label: `${p.nombre} (${p.sku})`,
            value: p.cantidad,
            detail: formatMoney(p.monto),
          }))}
        />
      )}
    </Modal>
  );
}
