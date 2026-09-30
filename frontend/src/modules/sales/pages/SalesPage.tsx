import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { Button, DataList, DatePicker, PageHeader, Select, StatusBadge, type Column } from '@/shared/components';
import { useListParams } from '@/shared/hooks/useListParams';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime, fullName } from '@/shared/utils/format';
import { formatMoney, toCents } from '@/shared/utils/money';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { customerLabel, documentLabel, type Sale } from '../types';

export function SalesPage() {
  const navigate = useNavigate();
  const canView = usePermission(P.SALES_VIEW);
  const canCreate = usePermission(P.SALES_CREATE);
  const list = useListParams({ estado: '', fecha_desde: '', fecha_hasta: '' });
  const query = useQuery({
    queryKey: [SALES_KEY, 'list', list.params],
    queryFn: () => saleApi.list(list.params),
    placeholderData: keepPreviousData,
    enabled: canView,
  });

  const columns: Column<Sale>[] = [
    { key: 'id', header: 'N.º', render: (r) => `#${r.id}`, sortValue: (r) => r.id },
    { key: 'fecha', header: 'Fecha', render: (r) => formatDateTime(r.fecha), sortValue: (r) => r.fecha },
    {
      key: 'documento',
      header: 'Documento',
      render: (r) => <StatusBadge label={documentLabel(r.factura)} tone={r.factura ? 'info' : 'neutral'} />,
    },
    {
      key: 'cliente',
      header: 'Cliente',
      render: (r) => customerLabel(r.cliente),
      sortValue: (r) => customerLabel(r.cliente).toLowerCase(),
    },
    { key: 'vendedor', header: 'Vendedor', render: (r) => fullName(r.user) },
    { key: 'items', header: 'Productos', align: 'right', render: (r) => r.details.length },
    { key: 'total', header: 'Total', align: 'right', render: (r) => formatMoney(r.total), sortValue: (r) => toCents(r.total) },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => (
        <StatusBadge label={r.estado === 'CONFIRMADA' ? 'Confirmada' : 'Anulada'} tone={r.estado === 'CONFIRMADA' ? 'success' : 'danger'} />
      ),
    },
  ];

  return (
    <>
      <PageHeader title="Ventas" actions={canCreate && <Button onClick={() => navigate('/sales/new')}>Nueva venta</Button>} />
      {canView ? (
        <>
          <div className="toolbar">
            <Select
              aria-label="Filtrar por estado"
              value={list.filters.estado}
              onChange={(e) => list.setFilter('estado', e.target.value)}
              options={[
                { value: 'CONFIRMADA', label: 'Confirmadas' },
                { value: 'ANULADA', label: 'Anuladas' },
              ]}
              placeholder="Todos los estados"
            />
            <DatePicker
              aria-label="Desde"
              value={list.filters.fecha_desde}
              onChange={(e) => list.setFilter('fecha_desde', e.target.value)}
            />
            <DatePicker
              aria-label="Hasta"
              value={list.filters.fecha_hasta}
              onChange={(e) => list.setFilter('fecha_hasta', e.target.value)}
            />
          </div>
          <DataList
            query={query}
            columns={columns}
            rowKey={(r) => r.id}
            onPageChange={list.setPage}
            onRowClick={(r) => navigate(`/sales/${r.id}`)}
          />
        </>
      ) : (
        <p className="muted">Puede registrar ventas desde “Nueva venta”.</p>
      )}
    </>
  );
}
