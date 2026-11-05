import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/services/httpClient';
import { useDebounce } from './useDebounce';

interface CelularCheck {
  existe: boolean;
  message: string | null;
}

/** Same cleanup and format as `zCelular`: only well-formed numbers are checked. */
function cleanCelular(value: unknown): string | null {
  const text = typeof value === 'string' ? value.replace(/[\s()-]/g, '') : '';
  return /^\+?\d{7,15}$/.test(text) ? text : null;
}

export const checkCelular = (celular: string, excludeId?: number | null) =>
  http
    .get<CelularCheck>('/users/celular-check', { params: { celular, ...(excludeId ? { exclude_id: excludeId } : {}) } })
    .then((r) => r.data);

/**
 * A phone belongs to one cédula / RUC only: while the user types, checks whether it is already
 * registered to another user and returns the message to show under the field (null when free).
 * `excludeId` is the user being edited (its own phone is not a duplicate).
 */
export function useCelularCheck(celular: unknown, excludeId?: number | null): string | null {
  const value = useDebounce(cleanCelular(celular), 400);
  const { data } = useQuery({
    queryKey: ['celular-check', value, excludeId ?? null],
    queryFn: () => checkCelular(value as string, excludeId),
    enabled: value !== null,
    staleTime: 30_000,
    retry: false,
  });
  // The typed value may have changed during the debounce: only report the result of the current number.
  if (value === null || value !== cleanCelular(celular) || !data?.existe) return null;
  return data.message ?? 'El número de celular ya existe.';
}
