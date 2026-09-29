import { useId, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { usePermission } from '@/modules/auth/components/Can';
import { Button, useToast } from '@/shared/components';
import { useDebounce } from '@/shared/hooks/useDebounce';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { CLIENTS_KEY, clientApi } from '../services/clientApi';
import type { Client } from '../types';
import { ClientFormModal } from './ClientFormModal';

interface Props {
  value: Pick<Client, 'id' | 'nombre' | 'apellido' | 'email'> | null;
  onChange: (client: Pick<Client, 'id' | 'nombre' | 'apellido' | 'email'> | null) => void;
  error?: string;
  label?: string;
}

const describe = (c: Pick<Client, 'nombre' | 'apellido' | 'email'>) => `${c.nombre} ${c.apellido} — ${c.email}`;

/** Searchable client picker showing "Nombre Apellido — email". */
export function ClientSelect({ value, onChange, error, label = 'Cliente' }: Props) {
  const id = useId();
  const canCreate = usePermission(P.CLIENTS_CREATE);
  const toast = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const debounced = useDebounce(search.trim(), 300);

  const results = useQuery({
    queryKey: [CLIENTS_KEY, 'search', debounced],
    queryFn: () => clientApi.list({ search: debounced, estado: true, size: 8 }),
    enabled: open,
  });

  return (
    <div className={`field client-select ${error ? 'field-invalid' : ''}`}>
      <label className="field-label" htmlFor={id}>
        {label} <span className="field-required">*</span>
      </label>

      {value ? (
        <div className="selected-value">
          <span>{describe(value)}</span>
          <Button size="sm" variant="ghost" onClick={() => onChange(null)}>
            Cambiar
          </Button>
        </div>
      ) : (
        <div className="combobox">
          <input
            id={id}
            className="input"
            placeholder="Buscar cliente…"
            value={search}
            autoComplete="off"
            role="combobox"
            aria-expanded={open}
            aria-controls={`${id}-list`}
            aria-invalid={Boolean(error)}
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
              {results.data?.items.map((c) => (
                <li key={c.id} role="option" aria-selected={false}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => {
                      onChange(c);
                      setSearch('');
                      setOpen(false);
                    }}
                  >
                    <strong>
                      {c.nombre} {c.apellido}
                    </strong>
                    <small className="muted">{c.email}</small>
                  </button>
                </li>
              ))}
              {results.data && results.data.items.length === 0 && <li className="muted">Sin resultados</li>}
            </ul>
          )}
          {canCreate && (
            <Button size="sm" variant="ghost" onClick={() => setCreating(true)}>
              + Nuevo cliente
            </Button>
          )}
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}

      {creating && (
        <ClientFormModal
          client={null}
          onClose={() => setCreating(false)}
          onSubmit={async (body) => {
            const created = await clientApi.create(body);
            await queryClient.invalidateQueries({ queryKey: [CLIENTS_KEY] });
            toast.success('Cliente creado.');
            onChange(created);
            setCreating(false);
          }}
        />
      )}
    </div>
  );
}
