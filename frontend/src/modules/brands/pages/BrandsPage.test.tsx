import { screen, within } from '@testing-library/react';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ModelsPage } from '@/modules/models/pages/ModelsPage';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { BrandsPage } from './BrandsPage';

const stamps = { created_at: '2026-10-01T10:00:00Z', updated_at: '2026-10-01T10:00:00Z' };
const page = <T,>(items: T[]) => Promise.resolve({ items, total: items.length, page: 1, size: 20, pages: 1 });
const modelCalls: Record<string, unknown>[] = [];

vi.mock('../services/brandApi', () => ({
  BRANDS_KEY: 'brands',
  brandApi: {
    list: () => page([{ id: 4, nombre: 'Samsung', descripcion: null, estado: true, modelos_count: 3, ...stamps }]),
  },
}));
vi.mock('@/modules/models/services/modelApi', () => ({
  MODELS_KEY: 'models',
  modelApi: {
    list: (params: Record<string, unknown>) => {
      modelCalls.push(params);
      return page([]);
    },
  },
}));

const renderAt = (route: string, permissionCodes: string[]) =>
  renderWithProviders(
    <Routes>
      <Route path="/brands" element={<BrandsPage />} />
      <Route path="/models" element={<ModelsPage />} />
    </Routes>,
    { route, auth: fakeAuth({ permissionCodes }) },
  );

describe('BrandsPage', () => {
  it('shows the number of models and links the name to the models of the brand', async () => {
    renderAt('/brands', [P.BRANDS_VIEW, P.MODELS_VIEW]);
    const link = await screen.findByRole('link', { name: 'Samsung' });
    expect(link).toHaveAttribute('href', '/models?brand_id=4');
    expect(screen.getByRole('columnheader', { name: /Modelos/ })).toBeInTheDocument();
    expect(within(link.closest('tr')!).getByText('3')).toBeInTheDocument();
  });

  it('shows the plain name without permission to see models', async () => {
    renderAt('/brands', [P.BRANDS_VIEW]);
    expect(await screen.findByText('Samsung')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Samsung' })).not.toBeInTheDocument();
  });

  it('the models screen opens filtered by the brand of the link', async () => {
    renderAt('/models?brand_id=4', [P.MODELS_VIEW]);
    expect(await screen.findByRole('heading', { name: 'Modelos' })).toBeInTheDocument();
    await vi.waitFor(() => expect(modelCalls[modelCalls.length - 1]).toMatchObject({ brand_id: '4' }));
    expect(screen.getByRole('link', { name: /Volver a Marcas/ })).toHaveAttribute('href', '/brands');
  });
});
