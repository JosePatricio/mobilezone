import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from 'react';

interface FieldProps {
  label?: string;
  error?: string;
  hint?: string;
  required?: boolean;
  children: (id: string, describedBy: string | undefined) => ReactNode;
  className?: string;
}

export function FormField({ label, error, hint, required, children, className = '' }: FieldProps) {
  const id = useId();
  const describedBy = error ? `${id}-error` : hint ? `${id}-hint` : undefined;
  return (
    <div className={`field ${error ? 'field-invalid' : ''} ${className}`}>
      {label && (
        <label htmlFor={id} className="field-label">
          {label}
          {required && <span className="field-required"> *</span>}
        </label>
      )}
      {children(id, describedBy)}
      {error ? (
        <p id={`${id}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : (
        hint && (
          <p id={`${id}-hint`} className="field-hint">
            {hint}
          </p>
        )
      )}
    </div>
  );
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
  hint?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, error, hint, required, className, ...rest },
  ref,
) {
  return (
    <FormField label={label} error={error} hint={hint} required={required} className={className}>
      {(id, describedBy) => (
        <input
          id={id}
          ref={ref}
          className="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FormField>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  label?: string;
  error?: string;
}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, error, required, className, rows = 3, ...rest },
  ref,
) {
  return (
    <FormField label={label} error={error} required={required} className={className}>
      {(id, describedBy) => (
        <textarea
          id={id}
          ref={ref}
          rows={rows}
          className="input"
          aria-invalid={Boolean(error)}
          aria-describedby={describedBy}
          {...rest}
        />
      )}
    </FormField>
  );
});
