import { screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { MainLayout } from './MainLayout';

describe('MainLayout', () => {
  it('warns while the password is still the cédula / RUC', () => {
    renderWithProviders(<MainLayout />, { auth: fakeAuth({ defaultPassword: true }) });
    expect(screen.getByRole('alert')).toHaveTextContent('Su contraseña sigue siendo su cédula / RUC');
    expect(within(screen.getByRole('alert')).getByRole('link', { name: 'Mi perfil' })).toHaveAttribute('href', '/profile');
  });

  it('shows no warning once the password was changed', () => {
    renderWithProviders(<MainLayout />, { auth: fakeAuth({ defaultPassword: false }) });
    expect(screen.queryByText(/sigue siendo su cédula/)).not.toBeInTheDocument();
  });
});
