import { useId, useState } from 'react';
import { Link } from 'react-router-dom';
import { inventoryApi } from '@/modules/inventory/services/inventoryApi';
import type { InventoryItem } from '@/modules/inventory/types';
import { Button, ProductThumb, SearchIcon } from '@/shared/components';
import { getErrorMessage } from '@/shared/services/apiError';
import { formatMoney } from '@/shared/utils/money';

interface Props {
  branchId: number | null;
  branchName?: string;
  canSearchInventory: boolean;
  onSelect: (item: InventoryItem) => void;
}

/**
 * Searches products (SKU or name) in the inventory of the sale branch when pressing Enter.
 * One match is added directly; several are listed to choose; none offers the Inventario module.
 */
export function ProductSearch({ branchId, branchName, canSearchInventory, onSelect }: Props) {
  const id = useId();
  const [term, setTerm] = useState('');
  const [results, setResults] = useState<InventoryItem[] | null>(null);
  const [searched, setSearched] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const select = (item: InventoryItem) => {
    onSelect(item);
    setResults(null);
    setTerm('');
  };

  const search = async () => {
    const value = term.trim();
    setError(null);
    if (!value || branchId === null) return;
    setLoading(true);
    try {
      const page = await inventoryApi.list({ branch_id: branchId, search: value, active: true, size: 10 });
      // An exact SKU match (e.g. barcode scanner) or a single result is added directly.
      const exact = page.items.filter((i) => i.product.sku.toLowerCase() === value.toLowerCase());
      const matches = exact.length === 1 ? exact : page.items;
      setSearched(value);
      if (matches.length === 1 && matches[0].stock > 0) select(matches[0]);
      else setResults(matches);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="product-search">
      <label className="field-label" htmlFor={id}>
        Buscar producto
      </label>
      <form
        className="input-group"
        onSubmit={(e) => {
          e.preventDefault();
          void search();
        }}
      >
        <input
          id={id}
          className="input"
          autoComplete="off"
          placeholder="SKU o nombre del producto y presione Enter"
          value={term}
          disabled={branchId === null}
          onChange={(e) => setTerm(e.target.value)}
        />
        <Button type="submit" variant="secondary" loading={loading} aria-label="Buscar producto" icon={<SearchIcon />} />
      </form>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {results && results.length === 0 && (
        <div className="alert alert-info" role="status">
          No se encontró “{searched}” en la sucursal {branchName ?? ''}.{' '}
          {canSearchInventory && (
            <Link to={`/inventory?search=${encodeURIComponent(searched)}`}>Buscar en otras sucursales (Inventario) →</Link>
          )}
        </div>
      )}

      {results && results.length > 0 && (
        <ul className="search-results" aria-label="Resultados de la búsqueda">
          {results.map((item) => (
            <li key={item.id}>
              <button type="button" disabled={item.stock <= 0} onClick={() => select(item)}>
                <ProductThumb src={item.product.imagen_url} alt={item.product.nombre} size="sm" />
                <span>
                  <strong>{item.product.nombre}</strong>
                  <small className={item.stock <= 0 ? 'text-danger' : 'muted'}>
                    {item.product.sku} · {formatMoney(item.product.precio_venta)} · Stock: {item.stock}
                  </small>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
