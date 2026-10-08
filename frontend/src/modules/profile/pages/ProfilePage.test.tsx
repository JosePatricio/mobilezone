import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { fakeAuth, renderWithProviders, testUser } from '@/test/utils';
import { ProfilePage } from './ProfilePage';

const api = vi.hoisted(() => ({ changePassword: vi.fn(), update: vi.fn(), uploadPhoto: vi.fn(), removePhoto: vi.fn() }));
vi.mock('../services/profileApi', () => ({ profileApi: api }));
vi.mock('@/shared/services/httpClient', () => ({
  http: {
    get: (url: string) =>
      Promise.resolve({ data: url === '/locations/provinces' ? [{ nombre: 'Pichincha', ciudades: ['Quito'] }] : [] }),
  },
  onUnauthorized: () => () => undefined,
}));

const fill = async (current: string, next: string, confirm: string) => {
  await userEvent.type(screen.getByLabelText(/Contraseña actual/), current);
  await userEvent.type(screen.getByLabelText(/^Nueva contraseña/), next);
  await userEvent.type(screen.getByLabelText(/Confirmar nueva contraseña/), confirm);
  await userEvent.click(screen.getByRole('button', { name: 'Cambiar contraseña' }));
};

beforeEach(() => vi.clearAllMocks());

describe('ProfilePage', () => {
  it('updates the own data of the logged user', async () => {
    api.update.mockImplementation((body: object) => Promise.resolve({ ...testUser, ...body }));
    const auth = fakeAuth();
    renderWithProviders(<ProfilePage />, { auth });
    expect(screen.getByLabelText(/^Nombre/)).toHaveValue('Ana');
    expect(screen.getByLabelText(/^Email/)).toHaveValue('ana@example.com');
    expect(screen.getByText('VENDEDOR')).toBeInTheDocument(); // role: read only

    await userEvent.clear(screen.getByLabelText(/^Celular/));
    await userEvent.type(screen.getByLabelText(/^Celular/), '0998887777');
    await userEvent.type(screen.getByLabelText(/^Dirección/), 'Av. Amazonas N24-12');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar cambios' }));

    await waitFor(() => expect(api.update).toHaveBeenCalled());
    expect(api.update.mock.calls[0][0]).toMatchObject({
      nombre: 'Ana',
      apellido: 'Pérez',
      email: 'ana@example.com',
      celular: '0998887777',
      direccion: 'Av. Amazonas N24-12',
    });
    expect(api.uploadPhoto).not.toHaveBeenCalled();
    await waitFor(() => expect(auth.updateUser).toHaveBeenCalled()); // header shows the new data
    expect(await screen.findByText('Datos actualizados.')).toBeInTheDocument();
  });

  it('changes the password and clears the form', async () => {
    api.changePassword.mockResolvedValue(undefined);
    const auth = fakeAuth({ defaultPassword: true });
    renderWithProviders(<ProfilePage />, { auth });
    await fill('Secret1234', 'NuevaClave99', 'NuevaClave99');
    expect(api.changePassword).toHaveBeenCalledWith({ current_password: 'Secret1234', new_password: 'NuevaClave99' });
    expect(await screen.findByText('Contraseña actualizada.')).toBeInTheDocument();
    expect(screen.getByLabelText(/Contraseña actual/)).toHaveValue('');
    expect(auth.passwordChanged).toHaveBeenCalled(); // hides the warning
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
