import axios from 'axios';
import type { ApiErrorBody } from '@/shared/types/api';

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

const GENERIC_MESSAGE = 'Ocurrió un error inesperado. Intente nuevamente.';
const NETWORK_MESSAGE = 'No se pudo conectar con el servidor. Verifique su conexión.';

/** Friendly overrides for some codes; otherwise the backend message (already user-facing) is used. */
const FRIENDLY_MESSAGES: Record<string, string> = {
  NOT_AUTHENTICATED: 'Debe iniciar sesión para continuar.',
  TOKEN_EXPIRED: 'Su sesión ha expirado. Inicie sesión nuevamente.',
  INVALID_TOKEN: 'Su sesión no es válida. Inicie sesión nuevamente.',
  FORBIDDEN: 'No tiene permisos para realizar esta acción.',
  VALIDATION_ERROR: 'Revise los datos ingresados.',
  INTEGRITY_CONFLICT: 'La operación no se pudo completar por un conflicto con otros datos.',
};

function isErrorBody(data: unknown): data is ApiErrorBody {
  return (
    typeof data === 'object' &&
    data !== null &&
    'error' in data &&
    typeof (data as ApiErrorBody).error?.code === 'string'
  );
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (axios.isAxiosError(err)) {
    if (!err.response) return new ApiError(0, 'NETWORK_ERROR', NETWORK_MESSAGE);
    const { status, data } = err.response;
    if (isErrorBody(data)) {
      // Internal errors are never shown in detail.
      const message = status >= 500 ? GENERIC_MESSAGE : data.error.message;
      return new ApiError(status, data.error.code, message, data.error.details);
    }
    return new ApiError(status, status >= 500 ? 'INTERNAL_ERROR' : 'HTTP_ERROR', GENERIC_MESSAGE);
  }
  return new ApiError(0, 'UNKNOWN_ERROR', GENERIC_MESSAGE);
}

export function getErrorMessage(err: unknown): string {
  const apiError = toApiError(err);
  // 400 business-rule errors share the VALIDATION_ERROR code but carry a specific message.
  if (apiError.code === 'VALIDATION_ERROR' && apiError.status !== 422) return apiError.message;
  return FRIENDLY_MESSAGES[apiError.code] ?? (apiError.message || GENERIC_MESSAGE);
}

/** Maps 422 validation details to `{ field: message }` for forms. */
export function getFieldErrors(err: unknown): Record<string, string> {
  const apiError = toApiError(err);
  if (apiError.code !== 'VALIDATION_ERROR' || !Array.isArray(apiError.details)) return {};
  const result: Record<string, string> = {};
  for (const detail of apiError.details as { field?: string; message?: string }[]) {
    if (detail.field && !result[detail.field]) result[detail.field] = detail.message ?? 'Valor inválido';
  }
  return result;
}
