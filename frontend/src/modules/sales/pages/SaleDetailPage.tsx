import { Link, useParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { PRODUCTS_KEY } from '@/modules/products/services/productApi';
import {
  Button,
  Card,
  ErrorState,
  Loading,
  PageHeader,
  ProductThumb,
  StatusBadge,
  useConfirm,
  useToast,
} from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { customerLabel, documentLabel } from '../types';

export function SaleDetailPage() {
  const id = Number(useParams().id);
  const canCancel = usePermission(P.SALES_CANCEL);
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: [SALES_KEY, 'detail', id], queryFn: () => saleApi.get(id) });
  const cancel = useMutation({
    mutationFn: () => saleApi.cancel(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SALES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const sale = query.data;

  const onCancel = async () => {
    const ok = await confirm({
      title: 'Anular venta',
      message: `¿Está seguro de que desea anular la venta #${sale.id}? El stock de los productos será restituido.`,
      confirmLabel: 'Anular venta',
      danger: true,
    });
    if (!ok) return;
    try {
      await cancel.mutateAsync();
      toast.success('Venta anulada.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader
        title={`${documentLabel(sale.factura)} · Venta #${sale.id}`}
        actions={
          <>
            <Link to="/sales" className="btn btn-secondary btn-md">
              Volver
            </Link>
            {canCancel && sale.estado === 'CONFIRMADA' && (
              <Button variant="danger" onClick={onCancel} loading={cancel.isPending}>
                Anular venta
              </Button>
            )}
          </>
        }
      />
      <Card>
        <dl className="detail-list detail-inline">
          <dt>Fecha</dt>
          <dd>{formatDateTime(sale.fecha)}</dd>
          <dt>Documento</dt>
          <dd>{documentLabel(sale.factura)}</dd>
          <dt>Cliente</dt>
          <dd>{customerLabel(sale.cliente)}</dd>
          <dt>Sucursal</dt>
          <dd>{sale.branch.nombre}</dd>
          <dt>Vendedor</dt>
          <dd>{fullName(sale.user)}</dd>
          <dt>Estado</dt>
          <dd>
            <StatusBadge
              label={sale.estado === 'CONFIRMADA' ? 'Confirmada' : 'Anulada'}
              tone={sale.estado === 'CONFIRMADA' ? 'success' : 'danger'}
            />
          </dd>
        </dl>
      </Card>
      <Card title="Productos">
        <div className="table-wrapper">
          <table className="table">
            <thead>
              <tr>
                <th>Producto</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Precio</th>
                <th className="text-right">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              {sale.details.map((d) => (
                <tr key={d.id}>
                  <td data-label="Producto">
                    <div className="cell-with-image">
                      <ProductThumb src={d.product.imagen_url} alt={d.product.nombre} size="sm" />
                      <div>
                        <strong>{d.product.nombre}</strong>
                        <small className="muted">{d.product.sku}</small>
                      </div>
                    </div>
                  </td>
                  <td data-label="Cantidad" className="text-right">
                    {d.cantidad}
                  </td>
                  <td data-label="Precio" className="text-right">
                    {formatMoney(d.precio_unitario)}
                  </td>
                  <td data-label="Subtotal" className="text-right">
                    {formatMoney(d.subtotal)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr>
                <td colSpan={3} className="text-right">
                  <strong>TOTAL</strong>
                </td>
                <td className="text-right total-cell">
                  <strong>{formatMoney(sale.total)}</strong>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
