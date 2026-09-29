import { z } from 'zod';
import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Path, Resolver, UseFormSetError } from 'react-hook-form';
import { getFieldErrors } from '@/shared/services/apiError';
import { isValidMoney, normalizeMoney } from './money';

/**
 * Raw form values: inputs hold strings (e.g. a select's "" before choosing) that
 * the schema coerces/transforms into the typed output received by `handleSubmit`.
 */
type FormPrimitive = string | number | boolean | null | undefined;
export type FormShape<S extends z.ZodTypeAny> = {
  [K in keyof z.input<S>]: [z.input<S>[K]] extends [object | null | undefined]
    ? [unknown] extends [z.input<S>[K]]
      ? FormPrimitive
      : z.input<S>[K]
    : FormPrimitive;
};

/** Typed zod resolver: form values in, parsed schema output in `handleSubmit`. */
export function zodForm<S extends z.ZodTypeAny>(schema: S): Resolver<FormShape<S>, unknown, z.output<S>> {
  return zodResolver(schema) as unknown as Resolver<FormShape<S>, unknown, z.output<S>>;
}

export const zText = (max: number, message = 'Campo obligatorio') =>
  z.string().trim().min(1, message).max(max, `Máximo ${max} caracteres`);

export const zOptionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .optional()
    .transform((v) => (v ? v : null));

export const zMoney = z
  .string()
  .trim()
  .min(1, 'Ingrese un monto')
  .refine(isValidMoney, 'Monto inválido (use hasta 2 decimales)')
  .transform(normalizeMoney);

export const zRequiredId = (message = 'Seleccione una opción') =>
  z.coerce.number({ invalid_type_error: message }).int().positive(message);

export const zOptionalId = z.preprocess(
  (v) => (v === '' || v === undefined || v === null ? null : Number(v)),
  z.number().int().positive().nullable(),
);

/** Copies 422 field errors from the API into react-hook-form. Returns true if any was applied. */
export function applyServerErrors<T extends FieldValues>(err: unknown, setError: UseFormSetError<T>): boolean {
  const fieldErrors = getFieldErrors(err);
  const entries = Object.entries(fieldErrors);
  entries.forEach(([field, message]) => setError(field as Path<T>, { type: 'server', message }));
  return entries.length > 0;
}
