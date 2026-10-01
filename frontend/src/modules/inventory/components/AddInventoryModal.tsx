import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PRODUCTS_KEY, productApi } from '@/modules/products/services/productApi';
import { Button, Input, Modal, Select, type SelectOption } from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { getErrorMessage } from '@/shared/services/apiError';
import type { InventoryRequest } from '../types';

interface Props {
  branchOptions: SelectOption[];
  defaultBranchId?: number;
  onClose: () => void;
  onSubmit: (body: InventoryRequest) => Promise<void>;
}

/** Adds stock of a product to a branch. If the product is already in the branch the units are summed. */
export function AddInventoryModal({ branchOptions, defaultBranchId, onClose, onSubmit }: Props) {
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId ? String(defaultBranchId) : '');
  const [stock, setStock] = useState('1');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const debounced = useDebounce(search.trim(), 300);

  const products = useQuery({
    queryKey: [PRODUCTS_KEY, 'inventory-picker', debounced],
    queryFn: () => productApi.list({ search: debounced, estado: true, size: 20 }),
  });

  const submit = async () => {
    setError(null);
    const units = Number(stock);
    if (!productId) return setError('Seleccione un producto.');
    if (!branchId) return setError('Seleccione una sucursal.');
    if (!Number.isInteger(units) || units <= 0) return setError('Ingrese una cantidad entera mayor que 0.');
    setSaving(true);
    try {
      await onSubmit({ product_id: Number(productId), branch_id: Number(branchId), stock: units });
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open
      title="Agregar stock"
      onClose={onClose}
      dismissible={!saving}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={saving}>
            Guardar
          </Button>
        </>
      }
    >
      <div className="form-grid">
        {error && (
          <div className="alert alert-error full" role="alert">
            {error}
          </div>
        )}
        <Input
          label="Buscar producto (SKU o nombre)"
          className="full"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select
          label="Producto"
          required
          className="full"
          value={productId}
          onChange={(e) => setProductId(e.target.value)}
          placeholder={products.isLoading ? 'Cargando…' : 'Seleccione…'}
          options={(products.data?.items ?? []).map((p) => ({ value: p.id, label: `${p.sku} · ${p.nombre}` }))}
        />
        <Select
          label="Sucursal"
          required
          value={branchId}
          onChange={(e) => setBranchId(e.target.value)}
          placeholder="Seleccione…"
          options={branchOptions}
        />
        <Input
          label="Cantidad a agregar"
          type="number"
          min={1}
          step={1}
          value={stock}
          hint="Si el producto ya está en la sucursal, se suma a su stock."
          onChange={(e) => setStock(e.target.value)}
        />
      </div>
    </Modal>
  );
}
