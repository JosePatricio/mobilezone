import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { INVENTORY_KEY, inventoryApi } from '@/modules/inventory/services/inventoryApi';
import { Loading, Modal } from '@/shared/components';
import type { Product } from '../types';

interface Props {
  product: Product;
  onClose: () => void;
}

/** Read-only stock of a product per branch. Stock is managed in the Inventario module. */
export function StockModal({ product, onClose }: Props) {
  const query = useQuery({
    queryKey: [INVENTORY_KEY, 'by-product', product.id],
    queryFn: () => inventoryApi.list({ product_id: product.id, size: 100 }),
  });

  return (
    <Modal open title={`Stock por sucursal — ${product.nombre}`} onClose={onClose}>
      <p className="stock-highlight">
        Stock total: <strong>{product.stock}</strong>
      </p>
      {query.isLoading ? (
        <Loading />
      ) : query.data && query.data.items.length > 0 ? (
        <div className="table-wrapper">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Sucursal</th>
                <th className="text-right">Stock</th>
              </tr>
            </thead>
            <tbody>
              {query.data.items.map((i) => (
                <tr key={i.id}>
                  <td data-label="Sucursal">{i.branch.nombre}</td>
                  <td data-label="Stock" className={`text-right ${i.stock === 0 ? 'text-danger' : ''}`}>
                    {i.stock}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <p className="muted">El producto no está registrado en ninguna sucursal.</p>
      )}
      <p>
        <Link to={`/inventory?search=${encodeURIComponent(product.sku)}`}>Ver en Inventario →</Link>
      </p>
    </Modal>
  );
}
