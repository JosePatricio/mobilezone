import { useQuery } from '@tanstack/react-query';
import { useId, useState } from 'react';
import { inventoryApi } from '@/modules/inventory/services/inventoryApi';
import type { InventoryItem } from '@/modules/inventory/types';
import { Button, ErrorState, Loading, Modal, ProductThumb } from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatMoney } from '@/shared/utils/money';

/** Products listed at once (the filter narrows them down). */
const PICKER_SIZE = 100;

interface Props {
  branchId: number;
  branchName?: string;
  onClose: () => void;
  onSelect: (item: InventoryItem) => void;
}

/**
 * Products of the sale branch shown by name, image and retail price (PVP); the text filters them while typing.
 * Clicking one selects it (products without stock cannot be selected).
 */
export function ProductPickerModal({ branchId, branchName, onClose, onSelect }: Props) {
  const inputId = useId();
  const [filter, setFilter] = useState('');
  const search = useDebounce(filter.trim(), 250);
  const query = useQuery({
    queryKey: ['inventory', 'picker', branchId, search],
    queryFn: () => inventoryApi.list({ branch_id: branchId, search: search || undefined, active: true, size: PICKER_SIZE }),
    placeholderData: (previous) => previous,
  });
  const items = query.data?.items ?? [];

  return (
    <Modal
      open
      size="lg"
      title={`Productos${branchName ? ` · ${branchName}` : ''}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Cancelar
        </Button>
      }
    >
      <label className="field-label" htmlFor={inputId}>
        Filtrar
      </label>
      <input
        id={inputId}
        className="input"
        type="search"
        autoComplete="off"
        autoFocus
        placeholder="Escriba el nombre del producto"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
      />

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : items.length === 0 ? (
        <p className="muted product-picker-empty" role="status">
          {search ? `No hay productos que coincidan con “${search}”.` : 'No hay productos en esta sucursal.'}
        </p>
      ) : (
        <ul className="product-picker" aria-label="Productos">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                disabled={item.stock <= 0}
                title={item.stock <= 0 ? 'Sin stock' : undefined}
                onClick={() => onSelect(item)}
              >
                <ProductThumb src={item.product.imagen_url} alt={item.product.nombre} size="lg" />
                <span>{item.product.nombre}</span>
                <strong className="product-picker-price">{formatMoney(item.product.precio_venta)}</strong>
                {item.stock <= 0 && <small className="text-danger">Sin stock</small>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}
