import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { MainLayout } from './MainLayout';
import { TodaySales } from './TodaySales';

const sales = vi.hoisted(() => ({ todaySummary: vi.fn() }));
vi.mock('@/modules/sales/services/saleApi', () => ({ SALES_KEY: 'sales', saleApi: sales }));
vi.mock('@/modules/settings/services/settingsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/modules/settings/services/settingsApi')>()),
  settingsApi: { salesGoals: () => Promise.resolve({ baja: '20.00', alta: '50.00' }) },
}));

beforeEach(() => sales.todaySummary.mockResolvedValue({ cantidad: 3, total: '35.50' }));

describe('TodaySales', () => {
  it('shows "Has vendido" with the emoji of the goals and opens Ventas', async () => {
    renderWithProviders(
      <Routes>
        <Route path="/" element={<TodaySales />} />
        <Route path="/sales" element={<p>Ventas page</p>} />
      </Routes>,
    );
    const button = await screen.findByRole('button', { name: /Has vendido \$ 35,50/ });
    expect(screen.getByText('$ 35,50').tagName).toBe('STRONG');
    expect(await screen.findByRole('img', { name: 'Meta alcanzada' })).toHaveTextContent('😊');
    await userEvent.click(button);
    expect(screen.getByText('Ventas page')).toBeInTheDocument();
  });

  it('sad face below the low goal, money eyes above the high goal', async () => {
    sales.todaySummary.mockResolvedValue({ cantidad: 1, total: '5.00' });
    const { unmount } = renderWithProviders(<TodaySales />);
    expect(await screen.findByRole('img', { name: 'Por debajo de la meta' })).toHaveTextContent('😞');
    unmount();
    sales.todaySummary.mockResolvedValue({ cantidad: 9, total: '120.00' });
    renderWithProviders(<TodaySales />);
    expect(await screen.findByRole('img', { name: 'Meta superada' })).toHaveTextContent('🤑');
  });
});

describe('MainLayout menu', () => {
  it('Comercial and Configuración are trees that open and close; the profile is in the header', async () => {
    const auth = fakeAuth({ permissionCodes: [P.PRODUCTS_VIEW, P.BRANDS_VIEW, P.USERS_VIEW] });
    renderWithProviders(<MainLayout />, { auth });
    const comercial = screen.getByRole('button', { name: 'Comercial' });
    expect(comercial).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('link', { name: 'Marcas' })).not.toBeInTheDocument();
    await userEvent.click(comercial);
    expect(comercial).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Marcas' })).toHaveAttribute('href', '/brands');
    expect(screen.getByRole('button', { name: 'Configuración' })).toBeInTheDocument();
    expect(screen.getByTitle('Perfil')).toHaveAttribute('href', '/profile');
  });

  it('opens the tree of the current page', () => {
    renderWithProviders(<MainLayout />, { auth: fakeAuth({ permissionCodes: [P.USERS_VIEW] }), route: '/users' });
    expect(screen.getByRole('button', { name: 'Configuración' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('link', { name: 'Usuarios' })).toBeInTheDocument();
  });
});
