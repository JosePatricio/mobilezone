import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { NotificationBell } from './NotificationBell';

const api = vi.hoisted(() => ({ overdueOrders: vi.fn(), dueSoonOrders: vi.fn(), lowStock: vi.fn() }));
vi.mock('@/modules/dashboard/services/dashboardApi', () => ({ DASHBOARD_KEY: 'dashboard', dashboardApi: api }));

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString();

const order = {
  id: 7,
  num_orden: 105,
  cliente: { id: 1, nombre: 'Ana', apellido: 'Pérez', identificacion: null, celular: null },
  marca: { id: 1, nombre: 'Samsung' },
  modelo: { id: 2, nombre: 'A10' },
  estado: 1,
  estado_label: 'En proceso',
  fecha_entrega: hoursAgo(3),
};
const soonOrder = {
  ...order,
  id: 8,
  num_orden: 106,
  marca: { id: 3, nombre: 'Apple' },
  modelo: { id: 4, nombre: 'iPhone 11' },
  fecha_entrega: new Date(Date.now() + 5 * 3_600_000 + 60_000).toISOString(),
};
const product = { id: 3, sku: 'VID-1', nombre: 'Vidrio', stock: 1, minimo_recomendado: 5, faltante: 4 };

const both = fakeAuth({ permissionCodes: [P.WORK_ORDERS_VIEW, P.PRODUCTS_VIEW] });

beforeEach(() => {
  vi.clearAllMocks();
  api.overdueOrders.mockResolvedValue([order]);
  api.dueSoonOrders.mockResolvedValue([soonOrder]);
  api.lowStock.mockResolvedValue([product]);
});

describe('NotificationBell', () => {
  it('counts the overdue and due-soon orders and the products below the minimum and lists them', async () => {
    renderWithProviders(<NotificationBell />, { auth: both });
    const bell = await screen.findByRole('button', { name: 'Notificaciones (3)' });
    await userEvent.click(bell);
    const panel = screen.getByRole('dialog', { name: 'Notificaciones' });

    const orders = within(panel).getByRole('region', { name: 'Órdenes atrasadas' });
    const link = within(orders).getByRole('link', { name: /Orden #105/ });
    expect(link).toHaveAttribute('href', '/work-orders/7');
    expect(link).toHaveTextContent('Samsung A10');
    expect(link).toHaveTextContent('Ana Pérez');
    expect(link).toHaveTextContent('Atrasada 3 horas');

    const soon = within(panel).getByRole('region', { name: 'Órdenes por atrasarse' });
    const soonLink = within(soon).getByRole('link', { name: /Orden #106/ });
    expect(soonLink).toHaveAttribute('href', '/work-orders/8');
    expect(soonLink).toHaveTextContent('Apple iPhone 11');
    expect(soonLink).toHaveTextContent('Tienes 5 horas');
    // Below the overdue ones.
    expect(orders.compareDocumentPosition(soon) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();

    const products = within(panel).getByRole('region', { name: 'Productos bajo el mínimo' });
    expect(within(products).getByRole('link', { name: /Vidrio/ })).toHaveTextContent('faltan 4');

    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('only checks what the user is allowed to see', async () => {
    renderWithProviders(<NotificationBell />, { auth: fakeAuth({ permissionCodes: [P.PRODUCTS_VIEW] }) });
    expect(await screen.findByRole('button', { name: 'Notificaciones (1)' })).toBeInTheDocument();
    expect(api.overdueOrders).not.toHaveBeenCalled();
    expect(api.dueSoonOrders).not.toHaveBeenCalled();
  });

  it('says there is nothing new without notifications', async () => {
    api.overdueOrders.mockResolvedValue([]);
    api.dueSoonOrders.mockResolvedValue([]);
    api.lowStock.mockResolvedValue([]);
    renderWithProviders(<NotificationBell />, { auth: both });
    await userEvent.click(screen.getByRole('button', { name: 'Notificaciones' }));
    expect(screen.getByRole('dialog')).toHaveTextContent('No hay notificaciones');
  });

  it('is hidden without permission to see orders or products', () => {
    renderWithProviders(<NotificationBell />);
    expect(screen.queryByRole('button', { name: /Notificaciones/ })).not.toBeInTheDocument();
  });
});
