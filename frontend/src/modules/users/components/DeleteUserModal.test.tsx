import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders, testUser } from '@/test/utils';
import type { User, UserUsage } from '../types';
import { DeleteUserModal } from './DeleteUserModal';

const api = vi.hoisted(() => ({ usage: vi.fn(), deleteUser: vi.fn(), list: vi.fn() }));
vi.mock('../services/userApi', () => ({ USERS_KEY: 'users', userApi: api }));

const seller: User = { ...testUser, id: 5, nombre: 'Vera', apellido: 'Ruiz', role: { id: 2, nombre: 'VENDEDOR' } };
const admin: User = { ...testUser, id: 1, nombre: 'Admin', apellido: 'Sistema', role: { id: 1, nombre: 'ADMIN' } };
const client: User = { ...testUser, id: 9, nombre: 'Juan', apellido: 'Cliente', role: { id: 4, nombre: 'CLIENTE' } };

const withRecords: UserUsage = {
  ventas: [{ id: 31, fecha: '2026-10-06T15:00:00Z', total_pagar: '50.00', estado: 'CONFIRMADA', rol: 'Vendedor' }],
  ventas_total: 1,
  ordenes: [{ id: 4, num_orden: 12, fecha: '2026-10-06', estado: 2, estado_label: 'Finalizado', rol: 'Registró' }],
  ordenes_total: 3,
  otros_total: 2,
  has_records: true,
};

beforeEach(() => {
  vi.clearAllMocks();
  api.deleteUser.mockResolvedValue(undefined);
  api.list.mockResolvedValue({ items: [seller, admin, client], total: 3, page: 1, size: 100, pages: 1 });
});

describe('DeleteUserModal', () => {
  it('deletes a user without sales nor orders after confirming', async () => {
    api.usage.mockResolvedValue({ ...withRecords, ventas: [], ventas_total: 0, ordenes: [], ordenes_total: 0, otros_total: 0, has_records: false });
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteUserModal user={seller} onClose={vi.fn()} onDeleted={onDeleted} />);
    expect(await screen.findByText(/no se puede deshacer/)).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Eliminar usuario' }));
    expect(api.deleteUser).toHaveBeenCalledWith(5, undefined);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });

  it('shows the sales and orders and reassigns them to the chosen user', async () => {
    api.usage.mockResolvedValue(withRecords);
    const onDeleted = vi.fn();
    renderWithProviders(<DeleteUserModal user={seller} onClose={vi.fn()} onDeleted={onDeleted} />);
    const dialog = await screen.findByRole('alertdialog');
    expect(await within(dialog).findByText('#31')).toBeInTheDocument();
    expect(within(dialog).getByText('Finalizado')).toBeInTheDocument();
    expect(within(dialog).getByText('y 2 órdenes más.')).toBeInTheDocument();
    const confirm = within(dialog).getByRole('button', { name: 'Eliminar usuario' });
    expect(confirm).toBeDisabled();

    // Staff records only go to staff users (not to clients nor the user itself).
    const target = within(dialog).getByLabelText('Usuario que recibe las ventas y órdenes');
    await waitFor(() => expect(within(target).getAllByRole('option')).toHaveLength(2));
    expect(within(target).queryByRole('option', { name: /Juan Cliente/ })).not.toBeInTheDocument();
    await userEvent.selectOptions(target, '1');
    await userEvent.click(confirm);

    expect(api.deleteUser).toHaveBeenCalledWith(5, 1);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
  });
});
