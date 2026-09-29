import { forwardRef, type InputHTMLAttributes } from 'react';
import { Input } from './FormField';

interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  label?: string;
}

export function SearchInput({ value, onChange, placeholder = 'Buscar…', label = 'Buscar' }: SearchInputProps) {
  return (
    <div className="search-input">
      <input
        type="search"
        className="input"
        aria-label={label}
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

interface LabeledInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label?: string;
  error?: string;
  hint?: string;
}

export const DatePicker = forwardRef<HTMLInputElement, LabeledInputProps>(function DatePicker(props, ref) {
  return <Input ref={ref} type="date" {...props} />;
});

/** Decimal input for money. Accepts up to 2 decimals; keeps the value as a string. */
export const MoneyInput = forwardRef<HTMLInputElement, LabeledInputProps>(function MoneyInput(props, ref) {
  return <Input ref={ref} type="text" inputMode="decimal" autoComplete="off" placeholder="0.00" {...props} />;
});
