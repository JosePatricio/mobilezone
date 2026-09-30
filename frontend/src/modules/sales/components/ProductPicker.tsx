import { useId, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { PRODUCTS_KEY, productApi } from '@/modules/products/services/productApi';
import type { Product } from '@/modules/products/types';
import { ProductThumb } from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { formatMoney } from '@/shared/utils/money';

/** Product search for the sale screen. Shows price and available stock. */
export function ProductPicker({ onSelect }: { onSelect: (product: Product) => void }) {
  const id = useId();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const debounced = useDebounce(search.trim(), 300);

  const results = useQuery({
    queryKey: [PRODUCTS_KEY, 'picker', debounced],
    queryFn: () => productApi.list({ search: debounced, estado: true, size: 10 }),
    enabled: open,
  });

  return (
    <div className="field combobox product-picker">
      <label className="field-label" htmlFor={id}>
        Buscar producto
      </label>
      <input
        id={id}
        className="input"
        placeholder="Nombre o SKU del producto…"
        value={search}
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onChange={(e) => {
          setSearch(e.target.value);
          setOpen(true);
        }}
      />
      {open && (
        <ul className="combobox-list" id={`${id}-list`} role="listbox">
          {results.isLoading && <li className="muted">Buscando…</li>}
          {results.data?.items.map((p) => {
            const noStock = p.stock <= 0;
            return (
              <li key={p.id} role="option" aria-selected={false} aria-disabled={noStock}>
                <button
                  type="button"
                  disabled={noStock}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => {
                    onSelect(p);
                    setSearch('');
                  }}
                >
                  <span className="picker-option">
                    <ProductThumb src={p.imagen_url} alt={p.nombre} size="sm" />
                    <span>
                      <strong>{p.nombre}</strong>
                      <small className={noStock ? 'text-danger' : 'muted'}>
                        {p.sku} · PVP {formatMoney(p.precio_venta)} · Stock disponible: {p.stock}
                      </small>
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
          {results.data && results.data.items.length === 0 && <li className="muted">Sin resultados</li>}
        </ul>
      )}
    </div>
  );
}
