import { useNavigate } from 'react-router-dom';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { userApi } from '@/modules/users/services/userApi';
import { Button, DataList, DatePicker, Input, PageHeader, SearchInput, Select, type Column } from '@/shared/components';
import { useListParams } from '@/shared/hooks/useListParams';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime, formatOrderNumber, fullName } from '@/shared/utils/format';
import { formatMoney, toCents } from '@/shared/utils/money';
import { useWorkOrderStatuses } from '../hooks/useWorkOrderStatuses';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import { StatusControl } from '../components/StatusControl';
import { WORK_ORDER_STATUS, type WorkOrderListItem } from '../types';

export function WorkOrdersPage() {
  const navigate = useNavigate();
  const canCreate = usePermission(P.WORK_ORDERS_CREATE);
  const canUpdate = usePermission(P.WORK_ORDERS_UPDATE);
  const { statuses } = useWorkOrderStatuses();
  const technicians = useQuery({ queryKey: ['users', 'technicians'], queryFn: userApi.technicians, staleTime: 60_000 });
  const list = useListParams({ num_orden: '', estado: '', tecnico_id: '', fecha_desde: '', fecha_hasta: '' });
  // The search box filters by client (name, email or cédula).
  const params = { ...list.params, cliente: list.params.search, search: undefined };
  const query = useQuery({
    queryKey: [WORK_ORDERS_KEY, 'list', params],
    queryFn: () => workOrderApi.list(params),
    placeholderData: keepPreviousData,
  });

  // Only the key data; the rest (vendedor, garantía, costo, anticipo, ...) is in the order detail.
  const columns: Column<WorkOrderListItem>[] = [
    {
      key: 'num',
      header: 'N.º Orden',
      render: (r) => (
        <>
          <strong>{formatOrderNumber(r.num_orden)}</strong>
          <small className="muted d-block">{formatDateTime(r.fecha_hora)}</small>
        </>
      ),
      sortValue: (r) => r.num_orden,
    },
    {
      key: 'cliente',
      header: 'Cliente',
      render: (r) => (
        <>
          {fullName(r.cliente)}
          {r.cliente.identificacion && <small className="muted d-block">{r.cliente.identificacion}</small>}
        </>
      ),
      sortValue: (r) => fullName(r.cliente),
    },
    {
      key: 'equipo',
      header: 'Equipo',
      render: (r) => (
        <>
          {r.marca.nombre} {r.modelo.nombre}
          <small className="muted d-block">{r.motivo_ingreso_label}</small>
        </>
      ),
      sortValue: (r) => `${r.marca.nombre} ${r.modelo.nombre}`.toLowerCase(),
    },
    { key: 'saldo', header: 'Saldo', align: 'right', render: (r) => formatMoney(r.saldo), sortValue: (r) => toCents(r.saldo) },
    {
      key: 'entrega',
      header: 'Entrega',
      render: (r) => (r.fecha_entrega ? formatDateTime(r.fecha_entrega) : '—'),
      sortValue: (r) => r.fecha_entrega ?? '',
    },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions" onClick={(e) => e.stopPropagation()}>
          <Button size="sm" variant="ghost" onClick={() => navigate(`/work-orders/${r.id}`)}>
            Ver
          </Button>
          {canUpdate && r.estado !== WORK_ORDER_STATUS.FINALIZADO && (
            <Button size="sm" variant="secondary" onClick={() => navigate(`/work-orders/${r.id}/edit`)}>
              Editar
            </Button>
          )}
        </div>
      ),
    },
    // Last column: the status can be changed from the table.
    {
      key: 'estado',
      header: 'Estado',
      render: (r) => <StatusControl order={r} canUpdate={canUpdate} />,
      sortValue: (r) => r.estado,
    },
  ];

  return (
    <>
      <PageHeader
        title="Órdenes de trabajo"
        actions={canCreate && <Button onClick={() => navigate('/work-orders/new')}>Nueva orden</Button>}
      />
      <div className="toolbar toolbar-wrap">
        <Input
          aria-label="Número de orden"
          placeholder="N.º orden"
          inputMode="numeric"
          value={list.filters.num_orden}
          onChange={(e) => list.setFilter('num_orden', e.target.value.replace(/\D/g, ''))}
        />
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Cliente o cédula…" label="Buscar cliente" />
        <Select
          aria-label="Filtrar por estado"
          value={list.filters.estado}
          onChange={(e) => list.setFilter('estado', e.target.value)}
          options={statuses.map((s) => ({ value: s.value, label: s.label }))}
          placeholder="Todos los estados"
        />
        <Select
          aria-label="Filtrar por vendedor"
          value={list.filters.tecnico_id}
          onChange={(e) => list.setFilter('tecnico_id', e.target.value)}
          options={(technicians.data ?? []).map((t) => ({ value: t.id, label: fullName(t) }))}
          placeholder="Todos los vendedores"
        />
        <DatePicker aria-label="Desde" value={list.filters.fecha_desde} onChange={(e) => list.setFilter('fecha_desde', e.target.value)} />
        <DatePicker aria-label="Hasta" value={list.filters.fecha_hasta} onChange={(e) => list.setFilter('fecha_hasta', e.target.value)} />
      </div>
      <DataList
        query={query}
        columns={columns}
        rowKey={(r) => r.id}
        onPageChange={list.setPage}
        onRowClick={(r) => navigate(`/work-orders/${r.id}`)}
      />
    </>
  );
}
