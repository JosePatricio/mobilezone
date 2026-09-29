import { Link } from 'react-router-dom';
import { useQueries } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { PRODUCTS_KEY, productApi } from '@/modules/products/services/productApi';
import { SALES_KEY, saleApi } from '@/modules/sales/services/saleApi';
import { statusTone, useWorkOrderStatuses } from '@/modules/work-orders/hooks/useWorkOrderStatuses';
import { WORK_ORDERS_KEY, workOrderApi } from '@/modules/work-orders/services/workOrderApi';
import { Card, PageHeader } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { todayIso } from '@/shared/utils/format';

/** Simple overview. The definitive dashboard is pending (spec §35.5). */
export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const canOrders = hasPermission(P.WORK_ORDERS_VIEW);
  const canSales = hasPermission(P.SALES_VIEW);
  const canProducts = hasPermission(P.PRODUCTS_VIEW);
  const { statuses } = useWorkOrderStatuses();

  const orderCounts = useQueries({
    queries: statuses.map((s) => ({
      queryKey: [WORK_ORDERS_KEY, 'count', s.value],
      queryFn: () => workOrderApi.list({ estado: s.value, size: 1 }).then((p) => p.total),
      enabled: canOrders,
    })),
  });
  const [salesToday, products] = useQueries({
    queries: [
      {
        queryKey: [SALES_KEY, 'count', todayIso()],
        queryFn: () =>
          saleApi.list({ fecha_desde: todayIso(), fecha_hasta: todayIso(), estado: 'CONFIRMADA', size: 1 }).then((p) => p.total),
        enabled: canSales,
      },
      {
        queryKey: [PRODUCTS_KEY, 'count'],
        queryFn: () => productApi.list({ estado: true, size: 1 }).then((p) => p.total),
        enabled: canProducts,
      },
    ],
  });

  return (
    <>
      <PageHeader title={`Hola, ${user?.nombre ?? ''}`}>Resumen general del sistema</PageHeader>
      <div className="stat-grid">
        {canOrders &&
          statuses.map((s, i) => (
            <Link key={s.value} to="/work-orders" className={`stat-card stat-${statusTone(s.value)}`}>
              <span className="stat-label">Órdenes · {s.label}</span>
              <span className="stat-value">{orderCounts[i]?.data ?? '…'}</span>
            </Link>
          ))}
        {canSales && (
          <Link to="/sales" className="stat-card">
            <span className="stat-label">Ventas de hoy</span>
            <span className="stat-value">{salesToday.data ?? '…'}</span>
          </Link>
        )}
        {canProducts && (
          <Link to="/products" className="stat-card">
            <span className="stat-label">Productos activos</span>
            <span className="stat-value">{products.data ?? '…'}</span>
          </Link>
        )}
      </div>
      <Card title="Accesos rápidos">
        <div className="quick-links">
          {hasPermission(P.SALES_CREATE) && (
            <Link to="/sales/new" className="btn btn-primary btn-md">
              Nueva venta
            </Link>
          )}
          {hasPermission(P.WORK_ORDERS_CREATE) && (
            <Link to="/work-orders/new" className="btn btn-primary btn-md">
              Nueva orden de trabajo
            </Link>
          )}
          {canProducts && (
            <Link to="/products" className="btn btn-secondary btn-md">
              Consultar stock
            </Link>
          )}
        </div>
      </Card>
    </>
  );
}
