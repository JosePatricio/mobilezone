import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Button, Input, Loading, Modal, useConfirm, useToast } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatDateTime } from '@/shared/utils/format';
import { PRODUCTS_KEY, productApi } from '../services/productApi';
import type { Product } from '../types';

const MOVEMENT_LABELS = { VENTA: 'Venta', ANULACION_VENTA: 'Anulación de venta', AJUSTE: 'Ajuste' } as const;

interface Props {
  product: Product;
  canAdjust: boolean;
  onClose: () => void;
}

/** Shows available stock, the audit trail and (with permission) manual adjustments. */
export function StockModal({ product, canAdjust, onClose }: Props) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const [cantidad, setCantidad] = useState('');
  const [motivo, setMotivo] = useState('');
  const [error, setError] = useState<string | null>(null);

  const stock = useQuery({ queryKey: [PRODUCTS_KEY, 'stock', product.id], queryFn: () => productApi.getStock(product.id) });
  const movements = useQuery({
    queryKey: [PRODUCTS_KEY, 'movements', product.id],
    queryFn: () => productApi.stockMovements(product.id),
  });
  const adjust = useMutation({
    mutationFn: (delta: number) => productApi.adjustStock(product.id, { cantidad: delta, motivo: motivo.trim() || null }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] }),
  });

  const current = stock.data?.stock ?? product.stock;
  const delta = Number(cantidad);
  const invalid = !Number.isInteger(delta) || delta === 0;
  const wouldBeNegative = !invalid && current + delta < 0;

  const onAdjust = async () => {
    setError(null);
    if (invalid) return setError('Ingrese un número entero distinto de cero.');
    if (wouldBeNegative) return setError(`El stock no puede quedar negativo (disponible: ${current}).`);
    const ok = await confirm({
      title: 'Ajustar stock',
      message: `El stock de "${product.nombre}" pasará de ${current} a ${current + delta}. ¿Desea continuar?`,
      confirmLabel: 'Ajustar',
    });
    if (!ok) return;
    try {
      await adjust.mutateAsync(delta);
      toast.success('Stock actualizado.');
      setCantidad('');
      setMotivo('');
    } catch (err) {
      setError(getErrorMessage(err));
    }
  };

  return (
    <Modal open size="lg" title={`Stock — ${product.nombre}`} onClose={onClose} dismissible={!adjust.isPending}>
      <p className="stock-highlight">
        Stock disponible: <strong>{stock.isLoading ? '…' : current}</strong>
      </p>

      {canAdjust && (
        <div className="form-grid stock-adjust">
          {error && (
            <div className="alert alert-error full" role="alert">
              {error}
            </div>
          )}
          <Input
            label="Cantidad (+ entrada / − salida)"
            type="number"
            step={1}
            value={cantidad}
            onChange={(e) => setCantidad(e.target.value)}
          />
          <Input label="Motivo" value={motivo} maxLength={255} onChange={(e) => setMotivo(e.target.value)} />
          <div className="full">
            <Button onClick={onAdjust} loading={adjust.isPending} disabled={!cantidad}>
              Aplicar ajuste
            </Button>
          </div>
        </div>
      )}

      <h3 className="section-title">Últimos movimientos</h3>
      {movements.isLoading ? (
        <Loading />
      ) : movements.data && movements.data.items.length > 0 ? (
        <div className="table-wrapper">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Tipo</th>
                <th className="text-right">Cantidad</th>
                <th className="text-right">Stock</th>
                <th>Detalle</th>
              </tr>
            </thead>
            <tbody>
              {movements.data.items.map((m) => (
                <tr key={m.id}>
                  <td data-label="Fecha">{formatDateTime(m.fecha)}</td>
                  <td data-label="Tipo">{MOVEMENT_LABELS[m.tipo]}</td>
                  <td data-label="Cantidad" className={`text-right ${m.cantidad < 0 ? 'text-danger' : 'text-success'}`}>
                    {m.cantidad > 0 ? `+${m.cantidad}` : m.cantidad}
                  </td>
                  <td data-label="Stock" className="text-right">
                    {m.stock_resultante}
                  </td>
                  <td data-label="Detalle">{m.motivo ?? m.referencia ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">Sin movimientos registrados.</p>
      )}
    </Modal>
  );
}
