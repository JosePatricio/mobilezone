import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { Button, Card, ErrorState, Loading, PageHeader, ProductThumb, StatusBadge, useToast } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDateTime, fullName } from '@/shared/utils/format';
import { formatMoney } from '@/shared/utils/money';
import { useDeleteSale } from '../hooks/useDeleteSale';
import { downloadReceipt } from '../receipt';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { PAYMENT_METHOD_LABELS, customerLabel, documentLabel } from '../types';

export function SaleDetailPage() {
  const id = Number(useParams().id);
  const canUpdate = usePermission(P.SALES_UPDATE);
  const canDelete = usePermission(P.SALES_CANCEL);
  const toast = useToast();
  const { remove, isPending } = useDeleteSale();
  const [downloading, setDownloading] = useState(false);
  const query = useQuery({ queryKey: [SALES_KEY, 'detail', id], queryFn: () => saleApi.get(id) });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  const sale = query.data;
  const editable = sale.estado === 'CONFIRMADA';

  const onReceipt = async () => {
    setDownloading(true);
    try {
      await downloadReceipt(sale.id);
    } catch {
      toast.error('No se pudo generar el comprobante PDF.');
    } finally {
      setDownloading(false);
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
            <Button variant="secondary" onClick={onReceipt} loading={downloading}>
              Comprobante PDF
            </Button>
            {canUpdate && editable && (
              <Link to={`/sales/${sale.id}/edit`} className="btn btn-primary btn-md">
                Editar
              </Link>
            )}
            {canDelete && editable && (
              <Button variant="danger" onClick={() => void remove(sale)} loading={isPending}>
                Eliminar
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
          <dt>Pago</dt>
          <dd>{sale.metodo_pago ? PAYMENT_METHOD_LABELS[sale.metodo_pago] : 'No registrado'}</dd>
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
                  Subtotal
                </td>
                <td className="text-right">{formatMoney(sale.total)}</td>
              </tr>
              {Number(sale.recargo) > 0 && (
                <tr>
                  <td colSpan={3} className="text-right">
                    Recargo tarjeta de crédito (6 %)
                  </td>
                  <td className="text-right">{formatMoney(sale.recargo)}</td>
                </tr>
              )}
              <tr>
                <td colSpan={3} className="text-right">
                  <strong>TOTAL A PAGAR</strong>
                </td>
                <td className="text-right total-cell">
                  <strong>{formatMoney(sale.total_pagar)}</strong>
                </td>
              </tr>
              {sale.monto_recibido !== null && (
                <tr>
                  <td colSpan={3} className="text-right">
                    Recibido / cambio
                  </td>
                  <td className="text-right">
                    {formatMoney(sale.monto_recibido)} / {formatMoney(sale.cambio)}
                  </td>
                </tr>
              )}
            </tfoot>
          </table>
        </div>
      </Card>
    </>
  );
}
