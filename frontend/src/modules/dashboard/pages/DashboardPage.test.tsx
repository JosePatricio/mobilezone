import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { todayIso } from '@/shared/utils/format';
import { DashboardPage } from './DashboardPage';

const api = vi.hoisted(() => ({ charts: vi.fn(), ordersOfTheDay: vi.fn(), lowStock: vi.fn() }));
vi.mock('../services/dashboardApi', () => ({ DASHBOARD_KEY: 'dashboard', dashboardApi: api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.charts.mockResolvedValue({ agrupacion: 'dia', periodos: [] });
  api.lowStock.mockResolvedValue([]);
  api.ordersOfTheDay.mockImplementation((fecha: string) =>
    Promise.resolve({ fecha, recibidas: 5, en_proceso: 2, finalizadas: fecha === todayIso() ? 3 : 1 }),
  );
});

describe('DashboardPage', () => {
  it('shows the orders received, in process and finalized of the day', async () => {
    renderWithProviders(<DashboardPage />, { auth: fakeAuth({ permissionCodes: [P.WORK_ORDERS_VIEW] }) });
    expect(await screen.findByText('5')).toBeInTheDocument();
    expect(screen.getByText('Órdenes recibidas')).toBeInTheDocument();
    expect(screen.getByText('Órdenes en proceso')).toBeInTheDocument();
    expect(screen.getByText('Órdenes finalizadas')).toBeInTheDocument();
    expect(screen.getByText('Hoy')).toBeInTheDocument();
    expect(api.ordersOfTheDay).toHaveBeenCalledWith(todayIso());
    // No sales boxes nor quick links any more.
    expect(screen.queryByText('Ventas de hoy')).not.toBeInTheDocument();
    expect(screen.queryByText('Accesos rápidos')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Día siguiente' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Día anterior' }));
    expect(api.ordersOfTheDay).toHaveBeenCalledTimes(2);
    expect(api.ordersOfTheDay.mock.calls[1][0] < todayIso()).toBe(true);
  });

  it('alerts the products below their recommended minimum', async () => {
    api.lowStock.mockResolvedValue([
      { id: 1, sku: 'VID-1', nombre: 'Vidrio templado', stock: 0, minimo_recomendado: 10, faltante: 10 },
      { id: 2, sku: 'CAB-1', nombre: 'Cable USB-C', stock: 1, minimo_recomendado: 5, faltante: 4 },
    ]);
    renderWithProviders(<DashboardPage />, { auth: fakeAuth({ permissionCodes: [P.PRODUCTS_VIEW] }) });
    expect(await screen.findByRole('heading', { name: /Productos bajo el mínimo recomendado \(2\)/ })).toBeInTheDocument();
    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('VID-1Vidrio templado01010');
    expect(rows[2]).toHaveTextContent('CAB-1Cable USB-C154');
    expect(screen.getByRole('link', { name: 'Ver productos' })).toHaveAttribute('href', '/products');
  });

  it('says so when no product is below its minimum, and hides the alert without permission to see products', async () => {
    const { unmount } = renderWithProviders(<DashboardPage />, { auth: fakeAuth({ permissionCodes: [P.PRODUCTS_VIEW] }) });
    expect(await screen.findByText('Todos los productos están sobre el mínimo recomendado')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    unmount();
    vi.clearAllMocks();
    renderWithProviders(<DashboardPage />, { auth: fakeAuth({ permissionCodes: [P.WORK_ORDERS_VIEW] }) });
    expect(await screen.findByText('Órdenes recibidas')).toBeInTheDocument();
    expect(api.lowStock).not.toHaveBeenCalled();
  });
});
