import { useNavigate, useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import {
  Avatar,
  Button,
  DataList,
  DatePicker,
  PageHeader,
  SearchInput,
  Select,
  StatusBadge,
  type Column,
} from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { useListParams } from '@/shared/hooks/useListParams';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime, fullName, todayIso } from '@/shared/utils/format';
import { formatMoney, toCents } from '@/shared/utils/money';
import { ReceiptViewer } from '../components/ReceiptViewer';
import { useDeleteSale } from '../hooks/useDeleteSale';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { PAYMENT_METHOD_LABELS, customerName, documentLabel, type Sale } from '../types';

export function SalesPage() {
  const navigate = useNavigate();
  const canView = usePermission(P.SALES_VIEW);
  const canCreate = usePermission(P.SALES_CREATE);
  const canUpdate = usePermission(P.SALES_UPDATE);
  const canDelete = usePermission(P.SALES_CANCEL);
  const { remove } = useDeleteSale();
  // By default only today's sales; the date filters can widen the range.
  const today = todayIso();
  const list = useListParams({ estado: '', fecha_desde: today, fecha_hasta: today, identificacion: '' });
  const identificacion = useDebounce(list.filters.identificacion);
  const params = { ...list.params, identificacion: identificacion.trim() };
  // ?comprobante=<id>: opens the receipt right after confirming a sale.
  const [searchParams, setSearchParams] = useSearchParams();
  const receiptId = Number(searchParams.get('comprobante')) || null;
  const showReceipt = (id: number | null) =>
    setSearchParams(id ? { comprobante: String(id) } : {}, { replace: true });
  const query = useQuery({
    queryKey: [SALES_KEY, 'list', params],
    queryFn: () => saleApi.list(params),
    placeholderData: keepPreviousData,
    enabled: canView,
  });

  const columns: Column<Sale>[] = [
    {
      key: 'vendedor',
      header: 'Vendedor',
      sortValue: (r) => fullName(r.user).toLowerCase(),
      // The seller's photo; its name appears on mouse over.
      render: (r) => (
        <span className="seller-avatar" title={fullName(r.user)}>
          <Avatar src={r.user.foto_url} alt={fullName(r.user)} size="sm" />
        </span>
      ),
    },
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
      render: (r) => customerName(r.cliente),
      sortValue: (r) => customerName(r.cliente).toLowerCase(),
    },
    { key: 'sucursal', header: 'Sucursal', render: (r) => r.branch.nombre, sortValue: (r) => r.branch.nombre },
    { key: 'pago', header: 'Pago', render: (r) => (r.metodo_pago ? PAYMENT_METHOD_LABELS[r.metodo_pago] : '—') },
    {
      key: 'total',
      header: 'Total',
      align: 'right',
      render: (r) => formatMoney(r.total_pagar),
      sortValue: (r) => toCents(r.total_pagar),
    },
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => (
        <StatusBadge
          label={r.estado === 'CONFIRMADA' ? 'Confirmada' : 'Anulada'}
          tone={r.estado === 'CONFIRMADA' ? 'success' : 'danger'}
        />
      ),
    },
    {
      key: 'comprobante',
      header: 'Comprobante',
      render: (r) => (
        <span onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="secondary" aria-label={`Ver comprobante de la venta #${r.id}`} onClick={() => showReceipt(r.id)}>
            PDF
          </Button>
        </span>
      ),
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) =>
        r.estado === 'CONFIRMADA' && (canUpdate || canDelete) ? (
          <div className="row-actions" onClick={(e) => e.stopPropagation()}>
            {canUpdate && (
              <Button size="sm" variant="secondary" onClick={() => navigate(`/sales/${r.id}/edit`)}>
                Editar
              </Button>
            )}
            {canDelete && (
              <Button size="sm" variant="ghost" className="text-danger" onClick={() => void remove(r)}>
                Eliminar
              </Button>
            )}
          </div>
        ) : null,
    },
  ];

  return (
    <>
      <PageHeader title="Ventas" actions={canCreate && <Button onClick={() => navigate('/sales/new')}>Nueva venta</Button>} />
      {canView ? (
        <>
          <div className="toolbar">
            <SearchInput
              label="Cédula / RUC del cliente"
              placeholder="Cédula / RUC del cliente"
              value={list.filters.identificacion}
              onChange={(value) => list.setFilter('identificacion', value.replace(/\D/g, ''))}
            />
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
            {(list.filters.fecha_desde !== today || list.filters.fecha_hasta !== today) && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => {
                  list.setFilter('fecha_desde', today);
                  list.setFilter('fecha_hasta', today);
                }}
              >
                Hoy
              </Button>
            )}
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
      <ReceiptViewer saleId={receiptId} onClose={() => showReceipt(null)} />
    </>
  );
}
