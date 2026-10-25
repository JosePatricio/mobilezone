import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { todayIso } from '@/shared/utils/format';
import { fakeAuth, renderWithProviders, testUser } from '@/test/utils';
import { SaleReceipt } from '../components/PrintableSale';
import type { Sale } from '../types';
import { SalesPage } from './SalesPage';

const sale = (id: number, estado: Sale['estado']): Sale => ({
  id,
  user_id: 3,
  user: { id: 3, nombre: 'Vera', apellido: 'Vendedora', email: 'vera@example.com', foto_url: '/media/users/v.png' },
  branch_id: 1,
  branch: { id: 1, nombre: 'Matriz', ubicacion: 'Quito', direccion: 'Av. Amazonas N24-10', telefono: '0991234567' },
  fecha: '2026-09-30T15:00:00Z',
  total: '100.00',
  estado,
  factura: false,
  metodo_pago: 'TARJETA',
  descuento: '0.00',
  recargo: '6.00',
  total_pagar: '106.00',
  monto_recibido: null,
  cambio: null,
  cliente_id: null,
  cliente: null,
  work_order_id: null,
  work_order: null,
  costo_repuesto: null,
  ganancia: null,
  details: [],
  created_at: '2026-09-30T15:00:00Z',
  updated_at: '2026-09-30T15:00:00Z',
});

const cancelled: number[] = [];
const listCalls: Record<string, unknown>[] = [];
vi.mock('../services/saleApi', () => ({
  SALES_KEY: 'sales',
  saleApi: {
    // The register is already open today (the cash opening modal is tested on its own).
    todayCashOpening: () =>
      Promise.resolve({ id: 1, user_id: 1, branch_id: 1, branch: { id: 1, nombre: 'Matriz' }, fecha: '2026-10-10', monto_inicial: '20.00', created_at: '2026-10-10T13:00:00Z' }),
    list: (params: Record<string, unknown>) => {
      listCalls.push(params);
      return Promise.resolve({ items: [sale(1, 'CONFIRMADA'), sale(2, 'ANULADA')], total: 2, page: 1, size: 20, pages: 1 });
    },
    get: (id: number) =>
      Promise.resolve({
        ...sale(id, 'CONFIRMADA'),
        descuento: '10.00',
        recargo: '5.40',
        total_pagar: '95.40',
        details: [
          {
            id: 7,
            product_id: 5,
            product: { id: 5, sku: 'CARG-01', nombre: 'Cargador USB-C', imagen_url: null },
            inventory_id: 9,
            cantidad: 2,
            precio_unitario: '50.00',
            subtotal: '100.00',
          },
        ],
      }),
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

  it('shows the Estadística button only to the ADMIN role, whatever the permissions', async () => {
    const all = ['sales.view', 'sales.create', 'sales.update', 'sales.cancel'];
    const { unmount } = renderWithProviders(<SalesPage />, { auth: fakeAuth({ permissionCodes: all }) });
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Estadística' })).not.toBeInTheDocument();
    unmount();

    const admin = { ...testUser, role: { id: 1, nombre: 'ADMIN' } };
    renderWithProviders(<SalesPage />, { auth: fakeAuth({ user: admin, permissionCodes: all }) });
    expect(await screen.findByRole('button', { name: 'Estadística' })).toBeInTheDocument();
  });

  it("shows only today's sales by default and filters by client cédula", async () => {
    listCalls.length = 0;
    renderWithProviders(<SalesPage />, { auth: fakeAuth({ permissionCodes: ['sales.view'] }) });
    await screen.findByRole('table');
    expect(listCalls[0]).toMatchObject({ fecha_desde: todayIso(), fecha_hasta: todayIso() });
    expect(screen.getByLabelText('Desde')).toHaveValue(todayIso());

    await userEvent.type(screen.getByRole('searchbox', { name: 'Cédula / RUC del cliente' }), '1712a');
    await vi.waitFor(() => expect(listCalls[listCalls.length - 1]).toMatchObject({ identificacion: '1712' }));
  });

  it('prints the 80 mm receipt (same format as the work orders) with the discount', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => undefined);
    renderWithProviders(<SalesPage />, { auth: fakeAuth({ permissionCodes: ['sales.view'] }) });
    const table = await screen.findByRole('table');
    expect(within(table).getAllByRole('columnheader').map((h) => h.textContent)).toContain('Comprobante');
    await userEvent.click(within(table).getByRole('button', { name: 'Imprimir comprobante de la venta #1' }));
    const dialog = await screen.findByRole('dialog', { name: 'Comprobante · Venta #1' });
    const preview = await within(dialog).findByTestId('receipt-preview');
    expect(preview).toHaveTextContent('Av. Amazonas N24-10');
    expect(preview).toHaveTextContent('Cargador USB-C');
    expect(preview).toHaveTextContent('2 x $ 50,00');
    expect(preview).toHaveTextContent(/Descuento- \$ 10,00Subtotal/); // the discount goes before the subtotal
    expect(preview).toHaveTextContent('TOTAL A PAGAR$ 95,40');
    // No payment data: the no-returns notice instead.
    expect(preview).toHaveTextContent('Salida la mercadería no se aceptan devoluciones');
    expect(preview).not.toHaveTextContent(/Recibido|Cambio|Pago/);
    // The thermal sheet printed by window.print (hidden on screen).
    expect(document.querySelector('body > .print-sheet')).toHaveTextContent('Descuento- $ 10,00');

    await userEvent.click(within(dialog).getByRole('button', { name: 'Imprimir' }));
    expect(print).toHaveBeenCalledTimes(1);
    print.mockRestore();
  });
});

describe('SaleReceipt', () => {
  it('shows a zero discount before the subtotal and the no-returns notice instead of the payment', () => {
    render(<SaleReceipt sale={{ ...sale(2, 'CONFIRMADA'), metodo_pago: 'EFECTIVO', monto_recibido: '120.00', cambio: '14.00' }} />);
    const receipt = document.body;
    expect(receipt).toHaveTextContent(/Descuento\$ 0,00Subtotal\$ 100,00/);
    expect(receipt).toHaveTextContent('Salida la mercadería no se aceptan devoluciones');
    expect(receipt).not.toHaveTextContent(/Recibido|Cambio|Efectivo/);
  });
});
