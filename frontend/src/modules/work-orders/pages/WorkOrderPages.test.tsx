import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import type { WorkOrder } from '../types';
import { WorkOrderDetailPage } from './WorkOrderDetailPage';
import { WorkOrdersPage } from './WorkOrdersPage';

const order = {
  id: 5,
  num_orden: 12,
  user_id: 1,
  user: { id: 1, nombre: 'Ana', apellido: 'Pérez', email: null },
  codigo_publico: 'abc',
  fecha: '2026-10-06',
  fecha_entrega: null,
  cliente_id: 7,
  cliente: { id: 7, nombre: 'Juan', apellido: 'Pérez', identificacion: '1712345675', celular: null, email: null },
  marca_id: 1,
  marca: { id: 1, nombre: 'Samsung' },
  modelo_id: 2,
  modelo: { id: 2, nombre: 'A10' },
  modelo_tecnico: null,
  color: null,
  motivo_ingreso: ['PANTALLA'],
  motivo_ingreso_label: 'Pantalla',
  tipo_display: null,
  bloqueo_tipo: 'NINGUNO',
  bloqueo_valor: null,
  observacion: null,
  presupuesto: '50.00',
  anticipo: '10.00',
  saldo: '40.00',
  garantia_dias: 30,
  estado: 0,
  estado_label: 'Recibido',
  tecnico_id: 1,
  tecnico: { id: 1, nombre: 'Ana', apellido: 'Pérez', email: null },
  branch_id: 1,
  branch: null,
  photos: [],
  status_changes: [],
  sale: null,
  spare_parts: [],
  spare_parts_total: '0.00',
  created_at: '2026-10-06T10:00:00Z',
  updated_at: '2026-10-06T10:00:00Z',
} as unknown as WorkOrder;

const api = vi.hoisted(() => ({
  get: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  catalogs: vi.fn(),
  statuses: vi.fn(),
}));
vi.mock('../services/workOrderApi', () => ({ WORK_ORDERS_KEY: 'work-orders', workOrderApi: api }));
vi.mock('@/modules/users/services/userApi', () => ({ userApi: { technicians: () => Promise.resolve([]) } }));

beforeEach(() => {
  vi.clearAllMocks();
  api.get.mockResolvedValue(order);
  api.list.mockResolvedValue({ items: [order], total: 1, page: 1, size: 20, pages: 1 });
  api.remove.mockResolvedValue(undefined);
  api.catalogs.mockResolvedValue({ motivos_ingreso: [], tipos_display: [], tipos_bloqueo: [], estados: [] });
  api.statuses.mockResolvedValue([]);
});

const renderDetail = (permissionCodes: string[]) =>
  renderWithProviders(
    <Routes>
      <Route path="/work-orders/:id" element={<WorkOrderDetailPage />} />
      <Route path="/work-orders" element={<p>Listado de órdenes</p>} />
    </Routes>,
    { route: '/work-orders/5', auth: fakeAuth({ permissionCodes }) },
  );

describe('WorkOrderDetailPage', () => {
  it('deletes the order after confirming and returns to the list', async () => {
    renderDetail([P.WORK_ORDERS_VIEW, P.WORK_ORDERS_DELETE]);
    await userEvent.click(await screen.findByRole('button', { name: 'Eliminar' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(dialog).toHaveTextContent('Esta acción no se puede deshacer');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Eliminar' }));

    expect(api.remove).toHaveBeenCalledWith(5);
    expect(await screen.findByText('Listado de órdenes')).toBeInTheDocument();
  });

  it('hides the button without permission', async () => {
    renderDetail([P.WORK_ORDERS_VIEW]);
    expect(await screen.findByRole('heading', { name: 'Orden #000012' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Eliminar' })).not.toBeInTheDocument();
  });
});

describe('WorkOrdersPage', () => {
  it('shows only the key columns', async () => {
    renderWithProviders(<WorkOrdersPage />, { auth: fakeAuth({ permissionCodes: [P.WORK_ORDERS_VIEW] }) });
    expect(await screen.findByText('Samsung A10')).toBeInTheDocument();
    const headers = screen.getAllByRole('columnheader').map((h) => h.textContent?.replace(/[↕↑↓]/g, '').trim());
    expect(headers).toEqual(['N.º Orden', 'Cliente', 'Equipo', 'Saldo', 'Entrega', 'Acciones', 'Estado']);
    expect(screen.getByText('Pantalla')).toBeInTheDocument();
  });
});
