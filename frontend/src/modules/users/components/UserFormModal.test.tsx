import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders, testUser } from '@/test/utils';
import type { UserRequest } from '../types';
import { UserFormModal } from './UserFormModal';

// Provinces load after the form opens (like the real API).
vi.mock('@/shared/services/httpClient', () => ({
  http: {
    get: (url: string) =>
      url === '/locations/provinces'
        ? new Promise((resolve) =>
            setTimeout(
              () =>
                resolve({
                  data: [
                    { nombre: 'Azuay', ciudades: ['Cuenca'] },
                    { nombre: 'Pichincha', ciudades: ['Cayambe', 'Quito'] },
                  ],
                }),
              20,
            ),
          )
        : Promise.resolve({ data: [] }),
  },
  onUnauthorized: () => () => undefined,
}));

const roles = [
  { id: 1, nombre: 'ADMIN' },
  { id: 4, nombre: 'CLIENTE' },
];

describe('UserFormModal location', () => {
  it('preselects Pichincha / Quito for a new user', async () => {
    const onSubmit = vi.fn((_body: UserRequest) => Promise.resolve());
    renderWithProviders(<UserFormModal user={null} roles={roles} onClose={() => undefined} onSubmit={onSubmit} />);

    await waitFor(() => expect(screen.getByLabelText('Provincia')).toHaveValue('Pichincha'));
    expect(screen.getByLabelText('Ciudad')).toHaveValue('Quito');

    await userEvent.type(screen.getByLabelText(/^Nombre/), 'Luis');
    await userEvent.type(screen.getByLabelText(/^Apellido/), 'Mora');
    await userEvent.type(screen.getByLabelText(/^Email/), 'luis@example.com');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({ provincia: 'Pichincha', ciudad: 'Quito' });
  });

  it('keeps the location of an existing user', async () => {
    const user = { ...testUser, provincia: 'Azuay', ciudad: 'Cuenca' };
    renderWithProviders(<UserFormModal user={user} roles={roles} onClose={() => undefined} onSubmit={vi.fn()} />);
    await waitFor(() => expect(screen.getByLabelText('Provincia')).toHaveValue('Azuay'));
    expect(screen.getByLabelText('Ciudad')).toHaveValue('Cuenca');
  });

  it('does not invent a location for an existing user without one', async () => {
    const user = { ...testUser, provincia: null, ciudad: null };
    renderWithProviders(<UserFormModal user={user} roles={roles} onClose={() => undefined} onSubmit={vi.fn()} />);
    await screen.findByRole('option', { name: 'Pichincha' });
    expect(screen.getByLabelText('Provincia')).toHaveValue('');
  });
});
