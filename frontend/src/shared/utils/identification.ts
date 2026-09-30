import { z } from 'zod';

/**
 * Ecuadorian cédula (10 digits) / RUC (13 digits) validation, same rules as the backend
 * (app/domain/value_objects/identificacion.py):
 * - cédula: province 01-24 or 30, third digit 0-5, "módulo 10" check digit;
 * - RUC natural person: valid cédula + establishment code (not 000);
 * - RUC public (6) / private (9): province, third digit and establishment code.
 */

/** Removes spaces and dashes. */
export function cleanIdentificacion(value: string): string {
  return value.replace(/[\s-]/g, '');
}

function validProvince(value: string): boolean {
  const province = Number(value.slice(0, 2));
  return (province >= 1 && province <= 24) || province === 30;
}

export function cedulaCheckDigit(firstNine: string): number {
  let total = 0;
  for (let i = 0; i < 9; i += 1) {
    let value = Number(firstNine[i]) * (i % 2 === 0 ? 2 : 1);
    if (value > 9) value -= 9;
    total += value;
  }
  return (10 - (total % 10)) % 10;
}

export function isValidCedula(value: string): boolean {
  if (!/^\d{10}$/.test(value) || !validProvince(value) || Number(value[2]) > 5) return false;
  return cedulaCheckDigit(value.slice(0, 9)) === Number(value[9]);
}

export function isValidRuc(value: string): boolean {
  if (!/^\d{13}$/.test(value) || !validProvince(value)) return false;
  const third = Number(value[2]);
  if (third <= 5) return isValidCedula(value.slice(0, 10)) && value.slice(10) !== '000';
  if (third === 6) return value.slice(9) !== '0000';
  if (third === 9) return value.slice(10) !== '000';
  return false;
}

export function isValidIdentificacion(value: string): boolean {
  const clean = cleanIdentificacion(value);
  return clean.length === 10 ? isValidCedula(clean) : clean.length === 13 ? isValidRuc(clean) : false;
}

const IDENTIFICACION_MESSAGE = 'La cédula o el RUC no es válido';

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
