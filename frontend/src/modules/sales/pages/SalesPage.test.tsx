import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import type { Sale } from '../types';
import { SalesPage } from './SalesPage';

const sale = (id: number, estado: Sale['estado']): Sale => ({
  id,
  user_id: 3,
  user: { id: 3, nombre: 'Vera', apellido: 'Vendedora', email: 'vera@example.com', foto_url: '/media/users/v.png' },
  branch_id: 1,
  branch: { id: 1, nombre: 'Matriz' },
  fecha: '2026-09-30T15:00:00Z',
  total: '100.00',
  estado,
  factura: false,
  metodo_pago: 'TARJETA',
  recargo: '6.00',
  total_pagar: '106.00',
  monto_recibido: null,
  cambio: null,
  cliente_id: null,
  cliente: null,
  details: [],
  created_at: '2026-09-30T15:00:00Z',
  updated_at: '2026-09-30T15:00:00Z',
});

const cancelled: number[] = [];
vi.mock('../services/saleApi', () => ({
  SALES_KEY: 'sales',
  saleApi: {
    list: () => Promise.resolve({ items: [sale(1, 'CONFIRMADA'), sale(2, 'ANULADA')], total: 2, page: 1, size: 20, pages: 1 }),
    cancel: (id: number) => {
      cancelled.push(id);
      return Promise.resolve(sale(id, 'ANULADA'));
    },
  },
}));

describe('SalesPage', () => {
  it('shows the seller photo first (name on mouse over) and Editar / Eliminar actions', async () => {
    renderWithProviders(<SalesPage />, {
      auth: fakeAuth({ permissionCodes: ['sales.view', 'sales.create', 'sales.update', 'sales.cancel'] }),
    });
    const table = await screen.findByRole('table');
    const headers = within(table).getAllByRole('columnheader');
    expect(headers[0]).toHaveTextContent('Vendedor');

    const rows = within(table).getAllByRole('row').slice(1);
    const photo = within(rows[0]).getByRole('img', { name: 'Vera Vendedora' });
    expect(photo.closest('[title]')).toHaveAttribute('title', 'Vera Vendedora');
    expect(within(rows[0]).getByText('106,00', { exact: false })).toBeInTheDocument(); // total incl. card surcharge
    expect(within(rows[0]).getByRole('button', { name: 'Editar' })).toBeInTheDocument();
    // A cancelled sale cannot be edited nor deleted.
    expect(within(rows[1]).queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();

    await userEvent.click(within(rows[0]).getByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('el stock de sus productos se devolverá');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar venta' }));
    await vi.waitFor(() => expect(cancelled).toEqual([1]));
  });

  it('hides the actions without permissions', async () => {
    renderWithProviders(<SalesPage />, { auth: fakeAuth({ permissionCodes: ['sales.view'] }) });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Editar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});
