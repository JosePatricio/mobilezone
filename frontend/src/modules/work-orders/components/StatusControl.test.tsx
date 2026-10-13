import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import type { WorkOrderListItem } from '../types';
import { StatusControl } from './StatusControl';

const statusCalls: unknown[] = [];
const finalizeCalls: unknown[] = [];
let supplierCalls = 0;

vi.mock('../services/workOrderApi', () => ({
  WORK_ORDERS_KEY: 'work-orders',
  workOrderApi: {
    statuses: () =>
      Promise.resolve([
        { value: 0, label: 'Recibido' },
        { value: 1, label: 'En proceso' },
        { value: 2, label: 'Finalizado' },
      ]),
    setStatus: (id: number, body: unknown) => {
      statusCalls.push({ id, body });
      return Promise.resolve({});
    },
    suppliers: () => {
      supplierCalls += 1;
      return Promise.resolve([
        { id: 3, nombre: 'Repuestos Quito' },
        { id: 4, nombre: 'Partes Guayaquil' },
      ]);
    },
    finalize: (id: number, body: unknown) => {
      finalizeCalls.push({ id, body });
      return Promise.resolve({ sale: { id: 77 } });
    },
  },
}));
vi.mock('@/modules/branches/services/branchApi', () => ({ useBranchOptions: () => ({ data: [] }) }));

const order = (estado = 0): WorkOrderListItem =>
  ({
    id: 5,
    num_orden: 15,
    estado,
    estado_label: ['Recibido', 'En proceso', 'Finalizado'][estado],
    presupuesto: '100.00',
    anticipo: '30.00',
    saldo: '70.00',
    fecha_entrega: null,
  }) as WorkOrderListItem;

const auth = fakeAuth({ permissionCodes: ['work_orders.update'] });

beforeEach(() => {
  statusCalls.length = 0;
  finalizeCalls.length = 0;
  supplierCalls = 0;
});

describe('StatusControl', () => {
  it('offers Recibido / En proceso / Finalizado in a selector', async () => {
    renderWithProviders(<StatusControl order={order()} canUpdate />, { auth });
    const select = screen.getByRole('combobox', { name: 'Estado de la orden 000015' });
    expect(select).toHaveValue('0');
    await screen.findByRole('option', { name: 'Finalizado' });
    expect(within(select).getAllByRole('option').map((o) => o.textContent)).toEqual(['Recibido', 'En proceso', 'Finalizado']);
  });

  it('En proceso asks for the approximate delivery time and a note', async () => {
    renderWithProviders(<StatusControl order={order()} canUpdate />, { auth });
    await screen.findByRole('option', { name: 'En proceso' });
    await userEvent.selectOptions(screen.getByRole('combobox'), '1');
    const dialog = await screen.findByRole('dialog', { name: /En proceso/ });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    expect(await within(dialog).findByText('Ingrese la hora aproximada de entrega.')).toBeInTheDocument();
    expect(statusCalls).toHaveLength(0);

    fireEvent.change(within(dialog).getByLabelText(/Hora aproximada de entrega/), { target: { value: '2026-10-03T15:30' } });
    await userEvent.type(within(dialog).getByLabelText('Observación'), 'Cambio de pantalla');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));
    await vi.waitFor(() => expect(statusCalls).toHaveLength(1));
    expect(statusCalls[0]).toEqual({
      id: 5,
      body: { estado: 1, fecha_entrega: new Date(2026, 9, 3, 15, 30).toISOString(), observacion: 'Cambio de pantalla' },
    });
  });

  it('Finalizado asks for confirmation and the payment of the saldo, then registers the sale', async () => {
    renderWithProviders(<StatusControl order={order(1)} canUpdate />, { auth });
    await screen.findByRole('option', { name: 'Finalizado' });
    await userEvent.selectOptions(screen.getByRole('combobox'), '2');
    const dialog = await screen.findByRole('alertdialog', { name: 'Finalizar orden #000015' });
    expect(dialog).toHaveTextContent('Después ya no se podrá editar nada');
    expect(within(dialog).getByTestId('payment-total')).toHaveTextContent('70,00'); // saldo
    expect(dialog).toHaveTextContent('anticipo $ 30,00 ya pagado');

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Transferencia' }));
    const confirm = within(dialog).getByRole('button', { name: 'Finalizar y registrar venta' });
    await vi.waitFor(() => expect(confirm).toBeEnabled());
    await userEvent.click(confirm);
    expect(await within(dialog).findByText('Seleccione el proveedor.')).toBeInTheDocument();
    expect(finalizeCalls).toHaveLength(0);

    // Supplier selector with a search box.
    await userEvent.click(within(dialog).getByRole('button', { name: /Proveedor/ }));
    await userEvent.type(within(dialog).getByRole('searchbox', { name: 'Buscar proveedor' }), 'guaya');
    expect(within(within(dialog).getByRole('listbox')).getAllByRole('option').map((o) => o.textContent)).toEqual(['Partes Guayaquil']);
    await userEvent.click(within(dialog).getByRole('option', { name: 'Partes Guayaquil' }));

    await userEvent.click(confirm);
    await vi.waitFor(() => expect(finalizeCalls).toHaveLength(1));
    expect(finalizeCalls[0]).toEqual({
      id: 5,
      body: { metodo_pago: 'TRANSFERENCIA', monto_recibido: null, branch_id: 1, supplier_id: 4 },
    });
    expect(await screen.findByText(/Venta #77 registrada en Ventas/)).toBeInTheDocument();
  });

  it('a finalized order shows only its status (it cannot be changed)', () => {
    renderWithProviders(<StatusControl order={order(2)} canUpdate />, { auth });
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
    expect(screen.getByText('Finalizado')).toBeInTheDocument();
  });

  it('reads the suppliers again every time the dialog opens', async () => {
    renderWithProviders(<StatusControl order={order(1)} canUpdate />, { auth });
    await screen.findByRole('option', { name: 'Finalizado' });
    const select = screen.getByRole('combobox');
    for (const expected of [1, 2]) {
      await userEvent.selectOptions(select, '2');
      const dialog = await screen.findByRole('alertdialog');
      await vi.waitFor(() => expect(supplierCalls).toBe(expected));
      await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    }
  });
});
