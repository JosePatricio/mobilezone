import { AxiosError, AxiosHeaders } from 'axios';
import { getErrorMessage, getFieldErrors, toApiError } from './apiError';

function axiosError(status: number, data: unknown): AxiosError {
  const config = { headers: new AxiosHeaders() };
  return new AxiosError('fail', 'ERR', config, null, { status, statusText: '', data, headers: {}, config });
}

describe('apiError', () => {
  it('parses the standard error body', () => {
    const err = toApiError(
      axiosError(409, { error: { code: 'INSUFFICIENT_STOCK', message: 'Stock insuficiente para el producto solicitado.' } }),
    );
    expect(err.status).toBe(409);
    expect(err.code).toBe('INSUFFICIENT_STOCK');
    expect(getErrorMessage(err)).toBe('Stock insuficiente para el producto solicitado.');
  });

  it('never exposes internal error details', () => {
    const err = axiosError(500, { error: { code: 'INTERNAL_ERROR', message: 'Traceback: secret' } });
    expect(getErrorMessage(err)).not.toContain('secret');
  });

  it('handles network errors', () => {
    const err = new AxiosError('Network Error', 'ERR_NETWORK', { headers: new AxiosHeaders() });
    expect(toApiError(err).code).toBe('NETWORK_ERROR');
  });

  it('maps 422 details to form fields', () => {
    const err = axiosError(422, {
      error: { code: 'VALIDATION_ERROR', message: 'x', details: [{ field: 'nombre', message: 'obligatorio' }] },
    });
    expect(getFieldErrors(err)).toEqual({ nombre: 'obligatorio' });
  });

  it('uses the business message for 400 validation errors', () => {
    const err = axiosError(400, { error: { code: 'VALIDATION_ERROR', message: 'El anticipo no puede ser mayor.' } });
    expect(getErrorMessage(err)).toBe('El anticipo no puede ser mayor.');
  });
});
