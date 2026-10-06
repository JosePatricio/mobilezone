import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { renderWithProviders } from '@/test/utils';
import { ProfilePage } from './ProfilePage';

const api = vi.hoisted(() => ({ changePassword: vi.fn() }));
vi.mock('../services/profileApi', () => ({ profileApi: api }));

const fill = async (current: string, next: string, confirm: string) => {
  await userEvent.type(screen.getByLabelText(/Contraseña actual/), current);
  await userEvent.type(screen.getByLabelText(/^Nueva contraseña/), next);
  await userEvent.type(screen.getByLabelText(/Confirmar nueva contraseña/), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

beforeEach(() => vi.clearAllMocks());

describe('ProfilePage', () => {
  it('shows the data of the logged user', () => {
    renderWithProviders(<ProfilePage />);
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.getByText('ana@example.com')).toBeInTheDocument();
    expect(screen.getByText('Quito, Pichincha')).toBeInTheDocument();
  });

  it('changes the password and clears the form', async () => {
    api.changePassword.mockResolvedValue(undefined);
    renderWithProviders(<ProfilePage />);
    await fill('Secret1234', 'NuevaClave99', 'NuevaClave99');
    expect(api.changePassword).toHaveBeenCalledWith({ current_password: 'Secret1234', new_password: 'NuevaClave99' });
    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue('');
  });

  it('requires the confirmation to match', async () => {
    renderWithProviders(<ProfilePage />);
    await fill('Secret1234', 'NuevaClave99', 'OtraClave99');
    expect(await screen.findByText('Las contraseñas no coinciden')).toBeInTheDocument();
    expect(api.changePassword).not.toHaveBeenCalled();
  });

  it('shows the server error on the current password field', async () => {
    api.changePassword.mockRejectedValue(
      new ApiError(400, 'INVALID_CURRENT_PASSWORD', 'La contraseña actual es incorrecta.', { field: 'current_password' }),
    );
    renderWithProviders(<ProfilePage />);
    await fill('equivocada', 'NuevaClave99', 'NuevaClave99');
    expect(await screen.findByText('La contraseña actual es incorrecta.')).toBeInTheDocument();
  });
});
