import { useState } from 'react';
import { usePermission } from '@/modules/auth/components/Can';
import { CATEGORIES_KEY, categoryApi } from '@/modules/categories/services/categoryApi';
import {
  Button,
  DataList,
  PageHeader,
  SearchInput,
  Select,
  STATUS_FILTER_OPTIONS,
  StatusBadge,
  useConfirm,
  useToast,
  type Column,
} from '@/shared/components';
import { useCrudList, useCrudMutations, useOptions } from '@/shared/hooks/useCrud';
import { useListParams } from '@/shared/hooks/useListParams';
import { useStatusToggle } from '@/shared/hooks/useStatusToggle';
import { getErrorMessage } from '@/shared/services/apiError';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatMoney, toCents } from '@/shared/utils/money';
import { ProductFormModal } from '../components/ProductFormModal';
import { StockModal } from '../components/StockModal';
import { PRODUCTS_KEY, productApi } from '../services/productApi';
import type { Product } from '../types';

export function ProductsPage() {
  const canCreate = usePermission(P.PRODUCTS_CREATE);
  const canUpdate = usePermission(P.PRODUCTS_UPDATE);
  const canDelete = usePermission(P.PRODUCTS_DELETE);
  const canAdjust = usePermission(P.PRODUCTS_STOCK);
  const list = useListParams<{ category_id: string; estado: string }>({ category_id: '', estado: '' });
  const query = useCrudList(PRODUCTS_KEY, productApi, list.params);
  const categories = useOptions(CATEGORIES_KEY, categoryApi);
  const mutations = useCrudMutations(PRODUCTS_KEY, productApi);
  const toggleStatus = useStatusToggle(mutations.setStatus, 'el producto');
  const confirm = useConfirm();
  const toast = useToast();
  const [editing, setEditing] = useState<Product | null | undefined>(undefined);
  const [stockOf, setStockOf] = useState<Product | null>(null);
  const categoryOptions = (categories.data ?? []).map((c) => ({ value: c.id, label: c.nombre }));

  const onDelete = async (p: Product) => {
    const ok = await confirm({
      title: 'Eliminar producto',
      message: `¿Está seguro de que desea eliminar "${p.nombre}"? Si tiene ventas asociadas, desactívelo en su lugar.`,
      confirmLabel: 'Eliminar',
      danger: true,
    });
    if (!ok) return;
    try {
      await mutations.remove.mutateAsync(p.id);
      toast.success('Producto eliminado.');
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  const columns: Column<Product>[] = [
    { key: 'id', header: 'ID', render: (r) => r.id, sortValue: (r) => r.id },
    { key: 'nombre', header: 'Nombre', render: (r) => r.nombre, sortValue: (r) => r.nombre.toLowerCase() },
    { key: 'categoria', header: 'Categoría', render: (r) => r.category.nombre, sortValue: (r) => r.category.nombre },
    { key: 'precio', header: 'Precio', align: 'right', render: (r) => formatMoney(r.precio), sortValue: (r) => toCents(r.precio) },
    {
      key: 'stock',
      header: 'Stock',
      align: 'right',
      sortValue: (r) => r.stock,
      render: (r) => <span className={r.stock === 0 ? 'text-danger' : undefined}>{r.stock}</span>,
    },
    { key: 'estado', header: 'Estado', render: (r) => <StatusBadge active={r.estado} /> },
    {
      key: 'acciones',
      header: 'Acciones',
      align: 'right',
      render: (r) => (
        <div className="row-actions">
          <Button size="sm" variant="ghost" onClick={() => setStockOf(r)}>
            Stock
          </Button>
          {canUpdate && (
            <>
              <Button size="sm" variant="secondary" onClick={() => setEditing(r)}>
                Editar
              </Button>
              <Button size="sm" variant="ghost" onClick={() => toggleStatus(r.id, r.estado, r.nombre)}>
                {r.estado ? 'Desactivar' : 'Activar'}
              </Button>
            </>
          )}
          {canDelete && (
            <Button size="sm" variant="ghost" className="text-danger" onClick={() => onDelete(r)}>
              Eliminar
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Productos"
        actions={canCreate && <Button onClick={() => setEditing(null)}>Nuevo producto</Button>}
      />
      <div className="toolbar">
        <SearchInput value={list.search} onChange={list.setSearch} placeholder="Buscar producto…" />
        <Select
          aria-label="Filtrar por categoría"
          value={list.filters.category_id}
          onChange={(e) => list.setFilter('category_id', e.target.value)}
          options={categoryOptions}
          placeholder="Todas las categorías"
        />
        <Select
          aria-label="Filtrar por estado"
          value={list.filters.estado}
          onChange={(e) => list.setFilter('estado', e.target.value)}
          options={STATUS_FILTER_OPTIONS}
          placeholder="Todos los estados"
        />
      </div>
      <DataList query={query} columns={columns} rowKey={(r) => r.id} onPageChange={list.setPage} />

      {editing !== undefined && (
        <ProductFormModal
          product={editing}
          categoryOptions={categoryOptions}
          onClose={() => setEditing(undefined)}
          onSubmit={async ({ stock, ...rest }) => {
            if (editing) await mutations.update.mutateAsync({ id: editing.id, body: rest });
            else await mutations.create.mutateAsync({ ...rest, stock });
            toast.success(editing ? 'Cambios guardados.' : 'Producto creado.');
            setEditing(undefined);
          }}
        />
      )}
      {stockOf && <StockModal product={stockOf} canAdjust={canAdjust} onClose={() => setStockOf(null)} />}
    </>
  );
}
