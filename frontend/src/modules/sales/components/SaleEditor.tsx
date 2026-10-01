import { useEffect, useMemo, useReducer, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import { INVENTORY_KEY } from '@/modules/inventory/services/inventoryApi';
import { PRODUCTS_KEY } from '@/modules/products/services/productApi';
import { Button, Card, EmptyState, PageHeader, Select, useConfirm, useToast } from '@/shared/components';
import { ProductImagePreview } from '@/shared/components/ImagePreview';
import { getErrorMessage, toApiError } from '@/shared/services/apiError';
import type { NamedRef } from '@/shared/types/api';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatMoney, fromCents } from '@/shared/utils/money';
import { canConfirm, cartReducer, cartTotal, lineExceedsStock, lineSubtotalCents, type CartLine } from '../hooks/saleCart';
import { downloadReceipt } from '../receipt';
import { SALES_KEY, saleApi } from '../services/saleApi';
import { customerLabel, documentLabel, type Sale, type SaleCustomer } from '../types';
import { PaymentDialog, type PaymentResult } from './PaymentDialog';
import { ProductSearch } from './ProductSearch';
import { SaleDocumentFields } from './SaleDocumentFields';

interface Props {
  /** Edit mode: the sale being modified (returns / changes) and its lines. */
  sale?: Sale;
  initialLines?: CartLine[];
}

/**
 * New sale or modification of a confirmed sale. In edit mode the branch is fixed, the
 * `stock` of each line is what can be sold (branch stock + units already in the sale)
 * and the backend reconciles the inventory (returns go back to the branch).
 */
export function SaleEditor({ sale, initialLines }: Props) {
  const editing = Boolean(sale);
  const { user, hasPermission } = useAuth();
  const anyBranch = hasPermission(P.BRANCHES_ANY);
  const allBranches = useBranchOptions(anyBranch && !editing);
  // Sellers sell from their assigned branches; users with branches.any from any active branch.
  const branches: NamedRef[] = editing
    ? [sale!.branch]
    : anyBranch
      ? (allBranches.data ?? [])
      : (user?.branches ?? []);
  const [branchId, setBranchId] = useState<number | null>(sale?.branch_id ?? null);
  const [lines, dispatch] = useReducer(cartReducer, initialLines ?? []);
  const [error, setError] = useState<string | null>(null);
  const [factura, setFactura] = useState(sale?.factura ?? false);
  /** null = consumidor final (default) */
  const [customer, setCustomer] = useState<SaleCustomer | null>(sale?.cliente ?? null);
  const [paying, setPaying] = useState(false);
  const navigate = useNavigate();
  const confirm = useConfirm();
  const toast = useToast();
  const queryClient = useQueryClient();
  // Units already in the sale (edit mode): they count as available for that line.
  const originalQty = useMemo(
    () => new Map((initialLines ?? []).map((l) => [l.productId, l.cantidad])),
    [initialLines],
  );

  useEffect(() => {
    if (branchId === null && branches.length > 0) setBranchId(branches[0].id);
  }, [branchId, branches]);
  const branchName = branches.find((b) => b.id === branchId)?.nombre;

  const mutation = useMutation({
    mutationFn: (payment: PaymentResult) => {
      const body = {
        items: lines.map((l) => ({ inventory_id: l.inventoryId, cantidad: l.cantidad })),
        factura,
        cliente_id: customer?.id ?? null,
        ...payment,
      };
      return sale ? saleApi.update(sale.id, body) : saleApi.confirm({ ...body, branch_id: branchId as number });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [SALES_KEY] });
      queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
      queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
    },
  });

  const total = cartTotal(lines);

  const onBranchChange = async (value: number) => {
    if (lines.length > 0) {
      const ok = await confirm({
        title: 'Cambiar sucursal',
        message: 'Al cambiar de sucursal se quitarán los productos agregados. ¿Desea continuar?',
        confirmLabel: 'Cambiar',
      });
      if (!ok) return;
      dispatch({ type: 'clear' });
    }
    setError(null);
    setBranchId(value);
  };

  const onPay = async (payment: PaymentResult) => {
    setError(null);
    try {
      const saved = await mutation.mutateAsync(payment);
      setPaying(false);
      toast.success(editing ? `Venta #${saved.id} modificada.` : `Venta #${saved.id} registrada.`);
      try {
        await downloadReceipt(saved.id);
      } catch {
        toast.error('La venta se guardó, pero no se pudo generar el comprobante PDF. Descárguelo desde el detalle.');
      }
      navigate(`/sales/${saved.id}`);
    } catch (err) {
      setPaying(false);
      const apiError = toApiError(err);
      if (apiError.code === 'INSUFFICIENT_STOCK') {
        // Refresh the cart with the stock reported by the backend.
        const details = apiError.details as { product_id?: number; available?: number } | undefined;
        if (details?.product_id !== undefined && details.available !== undefined) {
          const stock = details.available + (originalQty.get(details.product_id) ?? 0);
          dispatch({ type: 'updateStock', productId: details.product_id, stock });
        }
      }
      setError(getErrorMessage(err));
    }
  };

  const title = sale ? `Modificar venta #${sale.id}` : 'Nueva venta';

  if (!editing && !anyBranch && branches.length === 0) {
    return (
      <>
        <PageHeader title={title} />
        <EmptyState title="Sin sucursal asignada">
          Para vender debe tener asignada al menos una sucursal. Solicítelo a un administrador.
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title={title}>
        {editing && 'Reduzca cantidades o elimine productos para registrar devoluciones; el stock se actualiza al guardar.'}
      </PageHeader>
      <Card>
        <div className="sale-branch">
          <Select
            label="Sucursal"
            value={branchId ?? ''}
            onChange={(e) => void onBranchChange(Number(e.target.value))}
            options={branches.map((b) => ({ value: b.id, label: b.nombre }))}
            disabled={editing || branches.length <= 1}
          />
        </div>
        <SaleDocumentFields
          factura={factura}
          onFacturaChange={setFactura}
          customer={customer}
          onCustomerChange={setCustomer}
        />
        <ProductSearch
          branchId={branchId}
          branchName={branchName}
          canSearchInventory={hasPermission(P.INVENTORY_VIEW)}
          onSelect={(item) => {
            setError(null);
            // New lines use the current PVP (precio de venta).
            dispatch({
              type: 'add',
              product: {
                inventoryId: item.id,
                productId: item.product_id,
                sku: item.product.sku,
                nombre: item.product.nombre,
                imagenUrl: item.product.imagen_url,
                precio: item.product.precio_venta,
                stock: item.stock + (originalQty.get(item.product_id) ?? 0),
              },
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
          <EmptyState title="Sin productos">Busque productos por SKU o nombre y presione Enter.</EmptyState>
        ) : (
          <div className="table-wrapper">
            <table className="table sale-table">
              <thead>
                <tr>
                  <th>Imagen</th>
                  <th>SKU</th>
                  <th>Nombre</th>
                  <th className="text-center">Cantidad</th>
                  <th className="text-right">Stock</th>
                  <th className="text-right">Precio</th>
                  <th className="text-right">Subtotal</th>
                  <th aria-label="Acciones" />
                </tr>
              </thead>
              <tbody>
                {lines.map((line) => (
                  <tr key={line.inventoryId} className={lineExceedsStock(line) ? 'row-invalid' : undefined}>
                    <td data-label="Imagen">
                      <ProductImagePreview src={line.imagenUrl} alt={line.nombre} />
                    </td>
                    <td data-label="SKU">
                      <code>{line.sku}</code>
                    </td>
                    <td data-label="Nombre">{line.nombre}</td>
                    <td data-label="Cantidad" className="text-center">
                      <div className="qty-stepper">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Quitar una unidad de ${line.nombre}`}
                          disabled={line.cantidad <= 1}
                          onClick={() => dispatch({ type: 'decrement', inventoryId: line.inventoryId })}
                        >
                          −
                        </button>
                        <input
                          type="number"
                          className="input input-qty"
                          min={1}
                          max={line.stock}
                          value={line.cantidad}
                          aria-label={`Cantidad de ${line.nombre}`}
                          onChange={(e) =>
                            dispatch({ type: 'setQuantity', inventoryId: line.inventoryId, cantidad: Number(e.target.value) })
                          }
                        />
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          aria-label={`Agregar una unidad de ${line.nombre}`}
                          disabled={line.cantidad >= line.stock}
                          onClick={() => dispatch({ type: 'increment', inventoryId: line.inventoryId })}
                        >
                          +
                        </button>
                      </div>
                      {lineExceedsStock(line) && <p className="field-error">Supera el stock disponible</p>}
                    </td>
                    <td data-label="Stock" className="text-right">
                      {line.stock}
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
                        aria-label={`Eliminar ${line.nombre}`}
                        onClick={() => dispatch({ type: 'remove', inventoryId: line.inventoryId })}
                      >
                        Eliminar
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="text-right">
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
          <Button
            variant="secondary"
            onClick={() => navigate(sale ? `/sales/${sale.id}` : '/sales')}
            disabled={mutation.isPending}
          >
            Cancelar
          </Button>
          <Button onClick={() => setPaying(true)} disabled={!canConfirm(lines) || branchId === null}>
            {editing ? 'Guardar cambios' : 'Confirmar venta'}
          </Button>
        </div>
      </Card>

      {paying && (
        <PaymentDialog
          total={total}
          title={editing ? 'Guardar cambios' : 'Confirmar venta'}
          confirmLabel={editing ? 'Guardar cambios' : 'Confirmar venta'}
          initialMethod={sale?.metodo_pago}
          loading={mutation.isPending}
          onCancel={() => setPaying(false)}
          onConfirm={(payment) => void onPay(payment)}
        >
          Se {editing ? 'guardará' : 'registrará'} una {documentLabel(factura).toLowerCase()} a nombre de{' '}
          {customerLabel(customer)} en la sucursal {branchName} con {lines.length} producto(s) por{' '}
          {formatMoney(total)}. Al confirmar se descargará el comprobante en PDF.
        </PaymentDialog>
      )}
    </>
  );
}
