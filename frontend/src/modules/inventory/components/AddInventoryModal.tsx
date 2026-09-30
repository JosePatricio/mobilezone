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

/** Registers a product in a branch with its initial stock. */
export function AddInventoryModal({ branchOptions, defaultBranchId, onClose, onSubmit }: Props) {
  const [search, setSearch] = useState('');
  const [productId, setProductId] = useState('');
  const [branchId, setBranchId] = useState(defaultBranchId ? String(defaultBranchId) : '');
  const [stock, setStock] = useState('0');
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
    if (!Number.isInteger(units) || units < 0) return setError('El stock inicial debe ser un entero mayor o igual a 0.');
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
      title="Agregar producto a sucursal"
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
          label="Stock inicial"
          type="number"
          min={0}
          step={1}
          value={stock}
          onChange={(e) => setStock(e.target.value)}
        />
      </div>
    </Modal>
  );
}
