import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import type { SelectOption } from './Select';

interface ComboboxProps {
  label: string;
  options: SelectOption[];
  value: string | number | null | undefined;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  required?: boolean;
  disabled?: boolean;
}

const normalize = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();

/** Select with a search box (filters the options while typing; accents are ignored). */
export function Combobox({ label, options, value, onChange, placeholder = 'Seleccione…', error, required, disabled }: ComboboxProps) {
  const id = useId();
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [active, setActive] = useState(0);
  const selected = options.find((o) => String(o.value) === String(value ?? ''));

  const filtered = useMemo(() => {
    const q = normalize(search.trim());
    return q ? options.filter((o) => normalize(o.label).includes(q)) : options;
  }, [options, search]);

  useEffect(() => {
    if (!open) return;
    setSearch('');
    setActive(0);
    searchRef.current?.focus();
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  const choose = (option: SelectOption | undefined) => {
    if (!option) return;
    onChange(String(option.value));
    setOpen(false);
  };

  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      choose(filtered[active]);
    } else if (e.key === 'Escape') {
      e.preventDefault();
      setOpen(false);
    }
  };

  return (
    <div className={`field combobox ${error ? 'field-invalid' : ''}`} ref={rootRef}>
      <span className="field-label" id={`${id}-label`}>
        {label}
        {required && <span className="field-required"> *</span>}
      </span>
      <button
        type="button"
        className="input combobox-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${id}-label ${id}-value`}
        aria-invalid={Boolean(error)}
        disabled={disabled}
        onClick={() => setOpen((v) => !v)}
      >
        <span id={`${id}-value`} className={selected ? '' : 'muted'}>
          {selected?.label ?? placeholder}
        </span>
        <span aria-hidden>▾</span>
      </button>
      {open && (
        <div className="combobox-popup">
          <input
            ref={searchRef}
            type="search"
            className="input"
            placeholder="Buscar…"
            aria-label={`Buscar ${label.toLowerCase()}`}
            aria-controls={`${id}-list`}
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKey}
          />
          <ul id={`${id}-list`} role="listbox" aria-labelledby={`${id}-label`} className="combobox-list">
            {filtered.length === 0 && <li className="muted combobox-empty">Sin resultados</li>}
            {filtered.map((option, i) => (
              <li
                key={option.value}
                role="option"
                aria-selected={String(option.value) === String(value ?? '')}
                className={i === active ? 'active' : ''}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => choose(option)}
              >
                {option.label}
              </li>
            ))}
          </ul>
        </div>
      )}
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
