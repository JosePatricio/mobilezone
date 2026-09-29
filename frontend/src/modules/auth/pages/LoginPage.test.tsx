import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('validates the form before calling the API', async () => {
    const login = vi.fn();
    renderWithProviders(<LoginPage />, { auth: fakeAuth({ status: 'anonymous', user: null, login }) });
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByText('Ingrese su email')).toBeInTheDocument();
    expect(screen.getByText('Ingrese su contraseña')).toBeInTheDocument();
    expect(login).not.toHaveBeenCalled();
  });

  it('shows the API error', async () => {
    const login = vi.fn().mockRejectedValue(new ApiError(401, 'INVALID_CREDENTIALS', 'Credenciales inválidas.'));
    renderWithProviders(<LoginPage />, { auth: fakeAuth({ status: 'anonymous', user: null, login }) });
    await userEvent.type(screen.getByLabelText('Email'), 'ana@example.com');
    await userEvent.type(screen.getByLabelText('Contraseña'), 'wrong');
    await userEvent.click(screen.getByRole('button', { name: 'Ingresar' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Credenciales inválidas.');
    expect(login).toHaveBeenCalledWith({ email: 'ana@example.com', password: 'wrong' });
  });

  it('informs when the session expired', () => {
    renderWithProviders(<LoginPage />, { auth: fakeAuth({ status: 'anonymous', user: null, logoutReason: 'expired' }) });
    expect(screen.getByText(/sesión ha expirado/)).toBeInTheDocument();
  });
});
