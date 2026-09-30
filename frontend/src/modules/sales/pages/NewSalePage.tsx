import { useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { PRODUCTS_KEY } from '@/modules/products/services/productApi';
import { Button, Card, EmptyState, PageHeader, useConfirm, useToast } from '@/shared/components';
import { toApiError, getErrorMessage } from '@/shared/services/apiError';
import { formatMoney, fromCents } from '@/shared/utils/money';
import { ProductPicker } from '../components/ProductPicker';
import { SaleDocumentFields } from '../components/SaleDocumentFields';
import { canConfirm, cartReducer, cartTotal, lineExceedsStock, lineSubtotalCents } from '../hooks/saleCart';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { customerLabel, documentLabel, type SaleCustomer } from '../types';

export function NewSalePage() {
  const [lines, dispatch] = useReducer(cartReducer, []);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState(false);
  /** null = consumidor final */
  const [customer, setCustomer] = useState<SaleCustomer | null>(null);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: () =>
      saleApi.confirm({
        items: lines.map((l) => ({ product_id: l.productId, cantidad: l.cantidad })),
        factura,
        cliente_id: customer?.id ?? null,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SALES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
    },
  });

  const total = cartTotal(lines);

  const onConfirm = async () => {
    setError(null);
    const ok = await confirm({
      title: 'Confirmar venta',
      message: (
        <>
          Se registrará una <strong>{documentLabel(factura).toLowerCase()}</strong> a nombre de{' '}
          <strong>{customerLabel(customer)}</strong> con <strong>{lines.length}</strong> producto(s) por un total de{' '}
          <strong>{formatMoney(total)}</strong>. ¿Desea continuar?
        </>
      ),
      confirmLabel: 'Confirmar venta',
    });
    if (!ok) return;
    try {
      const sale = await mutation.mutateAsync();
      toast.success(`Venta #${sale.id} registrada.`);
      navigate(`/sales/${sale.id}`);
    } catch (err) {
      const apiError = toApiError(err);
      if (apiError.code === 'INSUFFICIENT_STOCK') {
        // Refresh the cart with the stock reported by the backend.
        const details = apiError.details as { product_id?: number; available?: number } | undefined;
        if (details?.product_id !== undefined && details.available !== undefined) {
          dispatch({ type: 'updateStock', productId: details.product_id, stock: details.available });
        }
      }
      setError(getErrorMessage(err));
    }
  };

  return (
    <>
      <PageHeader title="Nueva venta" />
      <Card>
        <SaleDocumentFields
          factura={factura}
          onFacturaChange={setFactura}
          customer={customer}
          onCustomerChange={setCustomer}
        />
        <ProductPicker
          onSelect={(p) => {
            setError(null);
            // Sales always use the PVP (precio de venta).
            dispatch({
              type: 'add',
              product: { id: p.id, nombre: p.nombre, precio: p.precio_venta, stock: p.stock },
            });
          }}
        />
      </Card>

      <Card title="Detalle">
        {error && (
          <div className="alert alert-error" role="alert">
            {error}
          </div>
        )}
        {lines.length === 0 ? (
          <EmptyState title="Sin productos">Busque y agregue productos a la venta.</EmptyState>
        ) : (
          <div className="table-wrapper">
            <table className="table sale-table">
              <thead>
                <tr>
                  <th>Producto</th>
                  <th className="text-right">Disponible</th>
                  <th className="text-right">Cantidad</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Subtotal</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.productId} className={lineExceedsStock(line) ? 'row-invalid' : undefined}>
                    <td data-label="Producto">{line.nombre}</td>
                    <td data-label="Disponible" className="text-right">
                      {line.stock}
                    </td>
                    <td data-label="Cantidad" className="text-right">
                      <input
                        type="number"
                        className="input input-qty"
                        min={1}
                        max={line.stock}
                        value={line.cantidad}
                        aria-label={`Cantidad de ${line.nombre}`}
                        onChange={(e) =>
                          dispatch({ type: 'setQuantity', productId: line.productId, cantidad: Number(e.target.value) })
                        }
                      />
                      {lineExceedsStock(line) && <p className="field-error">Supera el stock disponible</p>}
                    </td>
                    <td data-label="Precio" className="text-right">
                      {formatMoney(line.precio)}
                    </td>
                    <td data-label="Subtotal" className="text-right">
                      {formatMoney(fromCents(lineSubtotalCents(line)))}
                    </td>
                    <td className="text-right">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="text-danger"
                        aria-label={`Quitar ${line.nombre}`}
                        onClick={() => dispatch({ type: 'remove', productId: line.productId })}
                      >
                        Quitar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={4} className="text-right">
                    <strong>TOTAL</strong>
                  </td>
                  <td className="text-right total-cell" data-testid="sale-total">
                    <strong>{formatMoney(total)}</strong>
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <div className="form-actions">
          <Button variant="secondary" onClick={() => navigate('/sales')} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={onConfirm} loading={mutation.isPending} disabled={!canConfirm(lines)}>
            Confirmar venta
          </Button>
        </div>
      </Card>
    </>
  );
}
