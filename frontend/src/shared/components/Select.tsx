import { forwardRef, type SelectHTMLAttributes } from 'react';
import { FormField } from './FormField';

export interface SelectOption {
  value: string | number;
  label: string;
}

interface SelectProps extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: string;
  error?: string;
  hint?: string;
  options: SelectOption[];
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { label, error, hint, options, placeholder, required, className, ...rest },
  ref,
) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <select
          id={id}
          ref={ref}
          className="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        >
          {placeholder !== undefined && <option value="">{placeholder}</option>}
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      )}
    </FormField>
  );
});

/** Common "Estado" filter options for lists. */
export const STATUS_FILTER_OPTIONS: SelectOption[] = [
  { value: 'true', label: 'Activos' },
  { value: 'false', label: 'Inactivos' },
];
