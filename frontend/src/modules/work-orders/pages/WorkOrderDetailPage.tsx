import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Can, usePermission } from '@/modules/auth/components/Can';
import { Button, Card, ErrorState, Loading, PageHeader, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDate, formatDateTime, formatOrderNumber, formatWarrantyDays, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { AddSparePartModal } from '../components/AddSparePartModal';
import { BalanceSummary } from '../components/BalanceSummary';
import { OrderQr } from '../components/OrderQr';
import { PatternLock } from '../components/PatternLock';
import { PrintableOrder } from '../components/PrintableOrder';
import { StatusControl } from '../components/StatusControl';
import { useWorkOrderCatalogs } from '../hooks/useWorkOrderCatalogs';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import { WORK_ORDER_STATUS, type AddSparePartRequest, type WorkOrderSparePart } from '../types';

export function WorkOrderDetailPage() {
  const id = Number(useParams().id);
  const canUpdate = usePermission(P.WORK_ORDERS_UPDATE);
  const canRemovePartPermission = usePermission(P.WORK_ORDERS_SPARE_PARTS_REMOVE);
  const { catalogs, labelOf } = useWorkOrderCatalogs();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [adding, setAdding] = useState(false);

  const query = useQuery({ queryKey: [WORK_ORDERS_KEY, 'detail', id], queryFn: () => workOrderApi.get(id) });
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [WORK_ORDERS_KEY] });
  const addPart = useMutation({ mutationFn: (body: AddSparePartRequest) => workOrderApi.addSparePart(id, body), onSuccess: invalidate });
  const removePart = useMutation({ mutationFn: (itemId: number) => workOrderApi.removeSparePart(id, itemId), onSuccess: invalidate });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const order = query.data;
  // A finalized order is closed: nothing can be modified.
  const finalized = order.estado === WORK_ORDER_STATUS.FINALIZADO;
  const canRemovePart = canRemovePartPermission && !finalized;

  const onRemovePart = async (item: WorkOrderSparePart) => {
    const ok = await confirm({
      title: 'Quitar repuesto',
      message: `¿Está seguro de que desea quitar "${item.spare_part.tipo}" de la orden?`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      await removePart.mutateAsync(item.id);
      toast.success('Repuesto quitado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={`Orden #${formatOrderNumber(order.num_orden)}`}
        actions={
          <>
            <Link to="/work-orders" className="btn btn-secondary btn-md">
              Volver
            </Link>
            <Button variant="secondary" onClick={() => window.print()}>
              Imprimir orden
            </Button>
            {canUpdate && !finalized && (
              <Link to={`/work-orders/${order.id}/edit`} className="btn btn-primary btn-md">
                Editar
              </Link>
            )}
          </>
        }
      >
        Registrada por <strong>{fullName(order.user)}</strong> · {formatDate(order.fecha)}
      </PageHeader>
      {finalized && (
        <div className="alert alert-info" role="status">
          Orden finalizada: ya no se puede modificar.
          {order.sale && (
            <>
              {' '}
              Venta registrada:{' '}
              <Link to={`/sales/${order.sale.id}`}>
                #{order.sale.id} · {formatMoney(order.sale.total_pagar)}
              </Link>
            </>
          )}
        </div>
      )}

      <div className="detail-grid">
        <Card title="Cliente">
          <dl className="detail-list">
            <dt>Cédula / RUC</dt>
            <dd>{order.cliente.identificacion ?? '—'}</dd>
            <dt>Nombre</dt>
            <dd>{fullName(order.cliente)}</dd>
            <dt>Celular</dt>
            <dd>{order.cliente.celular ?? '—'}</dd>
            <dt>Email</dt>
            <dd>{order.cliente.email ?? '—'}</dd>
          </dl>
        </Card>

        <Card title="Datos del celular">
          <dl className="detail-list">
            <dt>Marca</dt>
            <dd>{order.marca.nombre}</dd>
            <dt>Modelo</dt>
            <dd>{order.modelo.nombre}</dd>
            <dt>Modelo técnico</dt>
            <dd>{order.modelo_tecnico ?? '—'}</dd>
            <dt>Color</dt>
            <dd>{order.color ?? '—'}</dd>
            <dt>Motivo de ingreso</dt>
            <dd>
              {order.motivo_ingreso_label}
              {order.tipo_display ? ` · ${labelOf(catalogs.tipos_display, order.tipo_display)}` : ''}
            </dd>
            <dt>Garantía</dt>
            <dd>{formatWarrantyDays(order.garantia_dias)}</dd>
            <dt>Desbloqueo</dt>
            <dd>
              {order.bloqueo_tipo === 'PATRON' ? (
                <PatternLock value={order.bloqueo_valor} readOnly />
              ) : order.bloqueo_tipo === 'PIN' ? (
                <code>{order.bloqueo_valor}</code>
              ) : (
                'Sin bloqueo'
              )}
            </dd>
          </dl>
        </Card>

        <Card title="Trabajo">
          <dl className="detail-list">
            <dt>Observaciones</dt>
            <dd className="pre-line">{order.observacion ?? '—'}</dd>
            <dt>Estado</dt>
            <dd>
              <StatusControl order={order} canUpdate={canUpdate} />
            </dd>
            <dt>Técnico</dt>
            <dd>{order.tecnico ? fullName(order.tecnico) : 'Sin asignar'}</dd>
            <dt>Fecha de entrega</dt>
            <dd>{order.fecha_entrega ? formatDateTime(order.fecha_entrega) : 'Por confirmar'}</dd>
          </dl>
        </Card>

        <Card title="Valores">
          <BalanceSummary presupuesto={order.presupuesto} anticipo={order.anticipo} saldo={order.saldo} />
        </Card>

        <Card title="Fotos del equipo">
          {order.photos.length === 0 ? (
            <p className="muted">Sin fotos.</p>
          ) : (
            <div className="photo-gallery">
              {order.photos.map((photo, i) => (
                <a key={photo.id} href={photo.url} target="_blank" rel="noreferrer">
                  <img src={photo.url} alt={`Foto ${i + 1} del equipo`} />
                </a>
              ))}
            </div>
          )}
        </Card>

        <Card title="Estado en línea (QR)">
          <OrderQr codigo={order.codigo_publico} />
        </Card>

        <Card title="Historial de estados">
          <ol className="status-history">
            {[...order.status_changes].reverse().map((change) => (
              <li key={change.id}>
                <strong>{change.estado_label}</strong>
                <small className="muted">
                  {formatDateTime(change.created_at)} · {fullName(change.user)}
                </small>
                {change.fecha_entrega && <span>Entrega aproximada: {formatDateTime(change.fecha_entrega)}</span>}
                {change.observacion && <span className="pre-line">{change.observacion}</span>}
              </li>
            ))}
          </ol>
        </Card>
      </div>

      <Card
        title="Repuestos"
        actions={
          !finalized && (
            <Can permission={P.WORK_ORDERS_SPARE_PARTS_ADD}>
              <Button size="sm" onClick={() => setAdding(true)}>
                Agregar repuesto
              </Button>
            </Can>
          )
        }
      >
        {order.spare_parts.length === 0 ? (
          <p className="muted">No se han registrado repuestos.</p>
        ) : (
          <div className="table-wrapper">
            <table className="table">
              <thead>
                <tr>
                  <th>Repuesto</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Subtotal</th>
                  <th>Técnico</th>
                  <th>Fecha</th>
                  {canRemovePart && <th aria-label="Acciones" />}
                </tr>
              </thead>
              <tbody>
                {order.spare_parts.map((item) => (
                  <tr key={item.id}>
                    <td data-label="Repuesto">{item.spare_part.tipo}</td>
                    <td data-label="Cantidad" className="text-right">
                      {item.cantidad}
                    </td>
                    <td data-label="Precio" className="text-right">
                      {formatMoney(item.precio)}
                    </td>
                    <td data-label="Subtotal" className="text-right">
                      {formatMoney(item.subtotal)}
                    </td>
                    <td data-label="Técnico">{fullName(item.technician)}</td>
                    <td data-label="Fecha">{formatDateTime(item.fecha)}</td>
                    {canRemovePart && (
                      <td className="text-right">
                        <Button size="sm" variant="ghost" className="text-danger" onClick={() => onRemovePart(item)}>
                          Quitar
                        </Button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={3} className="text-right">
                    <strong>Total repuestos</strong>
                  </td>
                  <td className="text-right">
                    <strong>{formatMoney(order.spare_parts_total)}</strong>
                  </td>
                  <td colSpan={canRemovePart ? 3 : 2} />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
      </Card>

      {adding && (
        <AddSparePartModal
          onClose={() => setAdding(false)}
          onSubmit={async (body) => {
            await addPart.mutateAsync(body);
            toast.success('Repuesto agregado.');
            setAdding(false);
          }}
        />
      )}
      <PrintableOrder order={order} />
    </>
  );
}
