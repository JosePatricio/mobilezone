import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { StockValueModal } from '@/modules/products/components/StockValueModal';
import { SalesStatsModal } from '@/modules/sales/components/SalesStatsModal';
import { WorkOrderStatsModal } from '@/modules/work-orders/components/WorkOrderStatsModal';
import { renderWithProviders } from '@/test/utils';

const api = vi.hoisted(() => ({
  topProducts: vi.fn(),
  stockValue: vi.fn(),
  topBrands: vi.fn(),
  entryReasons: vi.fn(),
}));
vi.mock('@/modules/dashboard/services/dashboardApi', () => ({ DASHBOARD_KEY: 'dashboard', dashboardApi: api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.topProducts.mockResolvedValue([
    { id: 1, sku: 'CARG-01', nombre: 'Cargador USB-C', cantidad: 12, monto: '120.00' },
    { id: 2, sku: 'MICA-01', nombre: 'Mica', cantidad: 1, monto: '3.50' },
  ]);
  api.stockValue.mockResolvedValue({ activo_neto: '1500.00', activo_bruto: '820.50' });
  api.topBrands.mockResolvedValue([
    { id: 1, nombre: 'Samsung', ordenes: 8 },
    { id: 2, nombre: 'Apple', ordenes: 1 },
  ]);
  api.entryReasons.mockResolvedValue([
    { motivo: 'PANTALLA', etiqueta: 'Pantalla', ordenes: 5 },
    { motivo: 'BATERIA', etiqueta: 'Batería', ordenes: 2 },
  ]);
});

describe('SalesStatsModal', () => {
  it('ranks the most sold products with units and amount', async () => {
    renderWithProviders(<SalesStatsModal open onClose={vi.fn()} />);
    const list = await screen.findByRole('list', { name: /más vendidos/ });
    const rows = within(list).getAllByRole('listitem');
    expect(rows).toHaveLength(2);
    expect(rows[0]).toHaveTextContent(/Cargador USB-C \(CARG-01\)12 unidades\$ 120,00/);
    expect(rows[1]).toHaveTextContent('1 unidad');
  });

  it('does not load while closed', () => {
    renderWithProviders(<SalesStatsModal open={false} onClose={vi.fn()} />);
    expect(api.topProducts).not.toHaveBeenCalled();
  });
});

describe('StockValueModal', () => {
  it('shows activo neto and activo bruto', async () => {
    renderWithProviders(<StockValueModal open onClose={vi.fn()} />);
    const dialog = await screen.findByRole('dialog', { name: 'Resumen de productos' });
    expect(await within(dialog).findByText('Activo neto')).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/Activo neto\$ 1500,00/);
    expect(dialog).toHaveTextContent(/Activo bruto\$ 820,50/);
  });
});

describe('WorkOrderStatsModal', () => {
  it('shows the top brands first and the entry reasons in the second tab', async () => {
    renderWithProviders(<WorkOrderStatsModal open onClose={vi.fn()} />);
    const brands = await screen.findByRole('list', { name: /Marcas/ });
    expect(within(brands).getAllByRole('listitem')[0]).toHaveTextContent('Samsung8 órdenes');
    expect(api.entryReasons).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('tab', { name: 'Motivos de ingreso' }));
    expect(screen.getByRole('tab', { name: 'Motivos de ingreso' })).toHaveAttribute('aria-selected', 'true');
    const reasons = await screen.findByRole('list', { name: /motivo de ingreso/ });
    expect(within(reasons).getAllByRole('listitem').map((li) => li.textContent)).toEqual([
      'Pantalla5 órdenes',
      'Batería2 órdenes',
    ]);
  });
});
