import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { inventoryApi } from '@/modules/inventory/services/inventoryApi';
import { EmptyState, ErrorState, Loading } from '@/shared/components';
import { SaleEditor } from '../components/SaleEditor';
import type { CartLine } from '../hooks/saleCart';
import { SALES_KEY, saleApi } from '../services/saleApi';
import type { Sale } from '../types';

/** Loads the sale and the current stock of its lines, then opens the editor. */
async function loadSale(id: number): Promise<{ sale: Sale; lines: CartLine[] }> {
  const sale = await saleApi.get(id);
  const inventories = await Promise.all(sale.details.map((d) => inventoryApi.get(d.inventory_id)));
  const lines = sale.details.map((d, i) => ({
    inventoryId: d.inventory_id,
    productId: d.product_id,
    sku: d.product.sku,
    nombre: d.product.nombre,
    imagenUrl: d.product.imagen_url,
    precio: d.precio_unitario, // historical price of the sale
    stock: inventories[i].stock + d.cantidad, // branch stock + units already sold in this sale
    cantidad: d.cantidad,
  }));
  return { sale, lines };
}

export function EditSalePage() {
  const id = Number(useParams().id);
  const query = useQuery({ queryKey: [SALES_KEY, 'edit', id], queryFn: () => loadSale(id), gcTime: 0 });

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;
  if (query.data.sale.estado !== 'CONFIRMADA') {
    return <EmptyState title="Venta anulada">Una venta anulada no se puede modificar.</EmptyState>;
  }
  return <SaleEditor sale={query.data.sale} initialLines={query.data.lines} />;
}
