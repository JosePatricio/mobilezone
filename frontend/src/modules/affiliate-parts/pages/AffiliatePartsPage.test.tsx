import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { fakeAuth, renderWithProviders, testUser } from '@/test/utils';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import type { AffiliatePart, AffiliatePartRequest } from '../types';
import { AffiliatePartsPage } from './AffiliatePartsPage';
import { PublicAffiliatePartPage } from './PublicAffiliatePartPage';
import { PublicAffiliatePartsPage } from './PublicAffiliatePartsPage';

const catalogs = {
  tipos: [
    { value: 'DISPLAY', label: 'Display' },
    { value: 'BATERIA', label: 'Batería' },
  ],
  condiciones: [
    { value: 'NUEVO', label: 'Nuevo' },
    { value: 'USADO', label: 'Usado' },
  ],
  estados: [
    { value: 'DISPONIBLE', label: 'Disponible' },
    { value: 'VENDIDO', label: 'Vendido' },
  ],
};

const part: AffiliatePart = {
  id: 7,
  tipo: 'DISPLAY',
  tipo_label: 'Display',
  condicion: 'USADO',
  condicion_label: 'Usado',
  garantia: true,
  estado: 'DISPONIBLE',
  estado_label: 'Disponible',
  descripcion: 'Samsung A10',
  precio: '35.00',
  afiliado: {
    id: 1,
    nombre: 'Ana',
    apellido: 'Pérez',
    celular: '0991234567',
    direccion: 'Av. Amazonas N24-12',
    provincia: 'Pichincha',
    ciudad: 'Quito',
  },
  imagen_url: null,
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
};
const page = { items: [part], total: 1, page: 1, size: 20, pages: 1 };

const api = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  setStatus: vi.fn(),
  remove: vi.fn(),
  visits: vi.fn(),
  catalogs: vi.fn(),
  publicList: vi.fn(),
  publicGet: vi.fn(),
  registerVisit: vi.fn(),
  uploadImage: vi.fn(),
  removeImage: vi.fn(),
}));
vi.mock('../services/affiliatePartApi', () => ({ AFFILIATE_PARTS_KEY: 'affiliate-parts', affiliatePartApi: api }));

beforeEach(() => {
  vi.clearAllMocks();
  api.catalogs.mockResolvedValue(catalogs);
  api.list.mockResolvedValue(page);
  api.publicList.mockResolvedValue(page);
  api.visits.mockResolvedValue(12);
  api.registerVisit.mockResolvedValue(undefined);
  api.publicGet.mockResolvedValue(part);
  api.create.mockImplementation((body: AffiliatePartRequest) => Promise.resolve({ ...part, ...body }));
  api.setStatus.mockResolvedValue({ ...part, estado: 'VENDIDO', estado_label: 'Vendido' });
});

const affiliateAuth = () =>
  fakeAuth({
    permissionCodes: [P.AFFILIATE_PARTS_MANAGE],
    user: { ...testUser, direccion: 'Av. Amazonas N24-12', role: { id: 3, nombre: 'TECNICO' } },
  });

describe('AffiliatePartsPage', () => {
  it('lists the parts of the affiliate with a public link per part', async () => {
    renderWithProviders(<AffiliatePartsPage />, { auth: affiliateAuth() });
    expect(await screen.findByText('Samsung A10')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Mis repuestos' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver' })).toHaveAttribute('href', '/repuestos/7');
    // The visits and published address boxes are not shown; only the administrator sees the
    // catalog link and the affiliate column.
    expect(screen.queryByText('Visitas al catálogo público')).not.toBeInTheDocument();
    expect(screen.queryByText('Dirección publicada')).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Ver catálogo público' })).not.toBeInTheDocument();
    expect(screen.queryByRole('columnheader', { name: /Afiliado/ })).not.toBeInTheDocument();
    expect(api.visits).not.toHaveBeenCalled();
  });

  it('the administrator sees the public catalog link (no visits box)', async () => {
    const admin = fakeAuth({ permissionCodes: [P.AFFILIATE_PARTS_MANAGE, P.AFFILIATE_PARTS_ANY] });
    renderWithProviders(<AffiliatePartsPage />, { auth: admin });
    expect(await screen.findByText('Samsung A10')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Ver catálogo público' })).toHaveAttribute('href', '/repuestos');
    expect(screen.queryByText('Visitas al catálogo público')).not.toBeInTheDocument();
    expect(screen.queryByText('Dirección publicada')).not.toBeInTheDocument();
  });

  it('publishes a new spare part', async () => {
    renderWithProviders(<AffiliatePartsPage />, { auth: affiliateAuth() });
    await userEvent.click(screen.getByRole('button', { name: 'Nuevo repuesto' }));
    const dialog = await screen.findByRole('dialog', { name: 'Nuevo repuesto' });
    await waitFor(() => expect(within(dialog).getAllByRole('option', { name: 'Batería' }).length).toBeGreaterThan(0));
    await userEvent.selectOptions(within(dialog).getByLabelText(/Tipo de repuesto/), 'BATERIA');
    await userEvent.type(within(dialog).getByLabelText(/Descripción/), 'iPhone 11');
    await userEvent.click(within(dialog).getByLabelText('Garantía'));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith({
        tipo: 'BATERIA',
        condicion: 'NUEVO',
        garantia: true,
        estado: 'DISPONIBLE',
        descripcion: 'iPhone 11',
        precio: null,
      }),
    );
    expect(await screen.findByText('Repuesto publicado.')).toBeInTheDocument();
  });

  it('uploads the image of the part after saving it', async () => {
    api.update.mockResolvedValue(part);
    api.uploadImage.mockResolvedValue({ ...part, imagen_url: '/media/affiliate_parts/x.png' });
    // Preview of the chosen file (not implemented by jsdom).
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:preview', revokeObjectURL: () => undefined }));
    renderWithProviders(<AffiliatePartsPage />, { auth: affiliateAuth() });
    await userEvent.click(await screen.findByRole('button', { name: 'Editar' }));
    const dialog = await screen.findByRole('dialog', { name: 'Editar repuesto' });
    const photo = new File([new Uint8Array([137, 80, 78, 71])], 'foto.png', { type: 'image/png' });
    await userEvent.upload(within(dialog).getByLabelText('Imagen'), photo);
    await userEvent.click(within(dialog).getByRole('button', { name: 'Guardar' }));

    await waitFor(() => expect(api.uploadImage).toHaveBeenCalledWith(7, photo));
    expect(api.update).toHaveBeenCalledWith(7, expect.objectContaining({ tipo: 'DISPLAY' }));
  });

  it('marks a part as sold', async () => {
    renderWithProviders(<AffiliatePartsPage />, { auth: affiliateAuth() });
    await userEvent.click(await screen.findByRole('button', { name: 'Marcar vendido' }));
    expect(api.setStatus).toHaveBeenCalledWith(7, 'VENDIDO');
  });
});

describe('PublicAffiliatePartsPage', () => {
  it('shows the parts of every affiliate with their address and counts the visit once', async () => {
    renderWithProviders(<PublicAffiliatePartsPage />, { auth: fakeAuth({ status: 'anonymous', user: null }) });
    expect(await screen.findByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '0991234567' })).toHaveAttribute('href', 'tel:0991234567');
    expect(screen.getByRole('link', { name: 'Display' })).toHaveAttribute('href', '/repuestos/7');
    expect(api.registerVisit).toHaveBeenCalledTimes(1);
    // The visit counter is never shown to the public.
    expect(screen.queryByText(/visita/)).not.toBeInTheDocument();
    // Available parts by default.
    expect(api.publicList).toHaveBeenCalledWith(expect.objectContaining({ estado: 'DISPONIBLE' }));
  });
});

describe('PublicAffiliatePartPage', () => {
  const renderDetail = (route: string) =>
    renderWithProviders(
      <Routes>
        <Route path="/repuestos/:id" element={<PublicAffiliatePartPage />} />
      </Routes>,
      { auth: fakeAuth({ status: 'anonymous', user: null }), route },
    );

  it('shows one part to anyone', async () => {
    renderDetail('/repuestos/7');
    expect(await screen.findByRole('heading', { name: 'Display' })).toBeInTheDocument();
    expect(screen.getByText('Samsung A10')).toBeInTheDocument();
    expect(api.publicGet).toHaveBeenCalledWith(7);
    expect(screen.getByRole('link', { name: 'Ver todos los repuestos' })).toHaveAttribute('href', '/repuestos');
  });

  it('reports an unknown part', async () => {
    api.publicGet.mockRejectedValue(new ApiError(404, 'AFFILIATE_PART_NOT_FOUND', 'Repuesto no encontrado.'));
    renderDetail('/repuestos/99');
    expect(await screen.findByText('Repuesto no encontrado')).toBeInTheDocument();
  });
});
