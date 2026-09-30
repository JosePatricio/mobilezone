import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { usePermission } from '@/modules/auth/components/Can';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import { PRODUCTS_KEY } from '@/modules/products/services/productApi';
import {
  Button,
  Checkbox,
  DataList,
  PageHeader,
  ProductThumb,
  SearchInput,
  Select,
  useConfirm,
  useToast,
  type Column,
} from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatMoney } from '@/shared/utils/money';
import { AddInventoryModal } from '../components/AddInventoryModal';
import { InventoryStockModal } from '../components/InventoryStockModal';
import { INVENTORY_KEY, inventoryApi } from '../services/inventoryApi';
import type { InventoryItem } from '../types';

/**
 * Stock per branch. Sellers use it to find in which branch a product is available
 * (search by SKU or name across every branch).
 */
export function InventoryPage() {
  const { user } = useAuth();
  const canManage = usePermission(P.INVENTORY_MANAGE);
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const [branchId, setBranchId] = useState(params.get('branch_id') ?? '');
  const [onlyWithStock, setOnlyWithStock] = useState(params.get('search') !== null);
  const [page, setPage] = useState(1);
  const debounced = useDebounce(search.trim());
  const branches = useBranchOptions();
  const queryClient = useQueryClient();
  const confirm = useConfirm();
  const toast = useToast();
  const [stockOf, setStockOf] = useState<InventoryItem | null>(null);
  const [adding, setAdding] = useState(false);
  const myBranches = new Set((user?.branches ?? []).map((b) => b.id));

  const filters = { page, size: 20, search: debounced, branch_id: branchId, with_stock: onlyWithStock ? true : '' };
  const query = useQuery({
    queryKey: [INVENTORY_KEY, 'list', filters],
    queryFn: () => inventoryApi.list(filters),
    placeholderData: keepPreviousData,
  });
  const branchOptions = (branches.data ?? []).map((b) => ({ value: b.id, label: b.nombre }));

  const onRemove = async (item: InventoryItem) => {
    const ok = await confirm({
      title: 'Quitar de la sucursal',
      message: `¿Quitar "${item.product.nombre}" de ${item.branch.nombre}? Solo es posible con stock 0 y sin movimientos.`,
      confirmLabel: 'Quitar',
      danger: true,
    });
    if (!ok) return;
    try {
      await inventoryApi.remove(item.id);
      await queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
      toast.success('Producto quitado de la sucursal.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<InventoryItem>[] = [
    {
      key: 'producto',
      header: 'Producto',
      sortValue: (r) => r.product.nombre.toLowerCase(),
      render: (r) => (
        <div className="cell-with-image">
          <ProductThumb src={r.product.imagen_url} alt={r.product.nombre} size="sm" />
          <div>
            <strong>{r.product.nombre}</strong>
            <small className="muted">{r.product.sku}</small>
          </div>
        </div>
      ),
    },
    {
      key: 'sucursal',
      header: 'Sucursal',
      sortValue: (r) => r.branch.nombre,
      render: (r) => (
        <>
          {r.branch.nombre}
          {myBranches.has(r.branch_id) && <small className="muted"> (su sucursal)</small>}
        </>
      ),
    },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      sortValue: (r) => r.stock,
      render: (r) => <span className={r.stock === 0 ? 'text-danger' : undefined}>{r.stock}</span>,
    },
    { key: 'pvp', header: 'PVP', align: 'right', render: (r) => formatMoney(r.product.precio_venta) },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" variant="ghost" onClick={() => setStockOf(r)}>
            {canManage ? 'Ajustar stock' : 'Movimientos'}
          </Button>
          {canManage && r.stock === 0 && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onRemove(r)}>
              Quitar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Inventario"
        actions={canManage && <Button onClick={() => setAdding(true)}>Agregar producto a sucursal</Button>}
      >
        Stock por sucursal. Busque por SKU o nombre para saber en qué sucursal está disponible un producto.
      </PageHeader>
      <div className="toolbar">
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
          placeholder="Buscar por SKU o nombre…"
        />
        <Select
          aria-label="Filtrar por sucursal"
          value={branchId}
          onChange={(e) => {
            setBranchId(e.target.value);
            setPage(1);
          }}
          options={branchOptions}
          placeholder="Todas las sucursales"
        />
        <Checkbox
          label="Solo con stock"
          checked={onlyWithStock}
          onChange={(e) => {
            setOnlyWithStock(e.target.checked);
            setPage(1);
          }}
        />
      </div>
      <DataList
        query={query}
        columns={columns}
        rowKey={(r) => r.id}
        onPageChange={setPage}
        emptyMessage={debounced ? `No se encontró "${debounced}" en ninguna sucursal.` : undefined}
      />

      {stockOf && <InventoryStockModal item={stockOf} canAdjust={canManage} onClose={() => setStockOf(null)} />}
      {adding && (
        <AddInventoryModal
          branchOptions={branchOptions}
          defaultBranchId={branchId ? Number(branchId) : undefined}
          onClose={() => setAdding(false)}
          onSubmit={async (body) => {
            await inventoryApi.create(body);
            await queryClient.invalidateQueries({ queryKey: [INVENTORY_KEY] });
            await queryClient.invalidateQueries({ queryKey: [PRODUCTS_KEY] });
            toast.success('Producto agregado a la sucursal.');
            setAdding(false);
          }}
        />
      )}
    </>
  );
}
