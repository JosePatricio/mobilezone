import { forwardRef, useId, type InputHTMLAttributes } from 'react';

interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  label: string;
  description?: string;
  /** Renders as a toggle switch (for boolean fields like estado/garantía). */
  toggle?: boolean;
}

export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, toggle = false, className = '', ...rest },
  ref,
) {
  const id = useId();
  return (
    <div className={`checkbox ${toggle ? 'checkbox-toggle' : ''} ${className}`}>
      <input id={id} ref={ref} type="checkbox" role={toggle ? 'switch' : undefined} {...rest} />
      <label htmlFor={id}>
        <span>{label}</span>
        {description && <small className="muted">{description}</small>}
      </label>
    </div>
  );
});
