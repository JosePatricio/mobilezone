import { z } from 'zod';

/** Removes spaces and dashes. */
export function cleanIdentificacion(value: string): string {
  return value.replace(/[\s-]/g, '');
}

/** Cédula = 10 digits, RUC = 13 digits (same rule as the backend). */
export function isValidIdentificacion(value: string): boolean {
  return /^\d{10}(\d{3})?$/.test(cleanIdentificacion(value));
}

const IDENTIFICACION_MESSAGE = 'La cédula debe tener 10 dígitos y el RUC 13';

export const zIdentificacion = z
  .string()
  .trim()
  .min(1, 'Ingrese la cédula o RUC')
  .transform(cleanIdentificacion)
  .refine(isValidIdentificacion, IDENTIFICACION_MESSAGE);

export const zOptionalIdentificacion = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? cleanIdentificacion(v) : null))
  .refine((v) => v === null || isValidIdentificacion(v), IDENTIFICACION_MESSAGE);

export const zCelular = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/[\s()-]/g, '') : null))
  .refine((v) => v === null || /^\+?\d{7,15}$/.test(v), 'Número de celular inválido');
