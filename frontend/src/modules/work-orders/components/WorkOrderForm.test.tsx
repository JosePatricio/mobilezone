import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import { PublicWorkOrderPage } from '../pages/PublicWorkOrderPage';
import type { PublicWorkOrder, WorkOrderRequest } from '../types';
import type { PhotoChanges } from './PhotoSlots';
import { WorkOrderForm } from './WorkOrderForm';

const catalogs = {
  motivos_ingreso: [
    { value: 'CAMBIO_DISPLAY', label: 'Cambio de display' },
    { value: 'BATERIA', label: 'Batería' },
  ],
  tipos_display: [
    { value: 'INCELL', label: 'INCELL' },
    { value: 'OLED', label: 'OLED' },
    { value: 'ORIGINAL', label: 'ORIGINAL' },
  ],
  tipos_garantia: [{ value: 'SIN_GARANTIA', label: 'Sin garantía' }],
  tipos_bloqueo: [
    { value: 'NINGUNO', label: 'Sin bloqueo' },
    { value: 'PATRON', label: 'Patrón' },
    { value: 'PIN', label: 'PIN' },
  ],
  estados: [{ value: 0, label: 'Recibido' }],
};

const publicOrder: PublicWorkOrder = {
  num_orden: 15,
  fecha: '2026-10-01',
  estado: 0,
  estado_label: 'Recibido',
  marca: { id: 1, nombre: 'Samsung' },
  modelo: { id: 2, nombre: 'A10' },
  color: 'Azul',
  motivo_ingreso: 'CAMBIO_DISPLAY',
  motivo_ingreso_label: 'Cambio de display',
  tipo_display: 'OLED',
  presupuesto: '80.00',
  anticipo: '20.00',
  saldo: '60.00',
  updated_at: '2026-10-01T21:20:00Z',
};

vi.mock('../services/workOrderApi', () => ({
  WORK_ORDERS_KEY: 'work-orders',
  workOrderApi: {
    catalogs: () => Promise.resolve(catalogs),
    statuses: () => Promise.resolve(catalogs.estados),
    lookupCustomer: (identificacion: string) =>
      identificacion === '1712345675'
        ? Promise.resolve({ id: 7, nombre: 'Juan', apellido: 'Pérez', identificacion, celular: '0991234567' })
        : Promise.reject(new ApiError(404, 'CLIENT_NOT_FOUND', 'No encontrado')),
    publicStatus: (codigo: string) =>
      codigo === 'abc'
        ? Promise.resolve(publicOrder)
        : Promise.reject(new ApiError(404, 'WORK_ORDER_NOT_FOUND', 'No encontrada')),
  },
}));
vi.mock('@/modules/brands/services/brandApi', () => ({
  BRANDS_KEY: 'brands',
  brandApi: { list: () => Promise.resolve({ items: [{ id: 1, nombre: 'Samsung' }], total: 1, page: 1, size: 100, pages: 1 }) },
}));
vi.mock('@/modules/models/services/modelApi', () => ({
  MODELS_KEY: 'models',
  modelApi: { list: () => Promise.resolve({ items: [{ id: 2, nombre: 'A10' }], total: 1, page: 1, size: 100, pages: 1 }) },
}));
vi.mock('@/modules/users/services/userApi', () => ({ userApi: { technicians: () => Promise.resolve([]) } }));

function renderForm(onSubmit = vi.fn<(body: WorkOrderRequest, photos: PhotoChanges) => Promise<void>>()) {
  renderWithProviders(<WorkOrderForm onSubmit={onSubmit} onCancel={() => undefined} />, {
    auth: fakeAuth({ permissionCodes: ['work_orders.create'] }),
  });
  return onSubmit;
}

describe('WorkOrderForm', () => {
  it('fills an existing client after typing the cédula and pressing Enter', async () => {
    renderForm();
    await userEvent.type(screen.getByLabelText(/Cédula \/ RUC/), '1712345675{Enter}');
    expect(await screen.findByDisplayValue('Juan')).toHaveAttribute('readonly');
    expect(screen.getByLabelText(/Apellidos/)).toHaveValue('Pérez');
    expect(screen.getByLabelText(/Celular/)).toHaveValue('0991234567');
  });

  it('registers a new client and sends the full order', async () => {
    const onSubmit = renderForm(vi.fn(() => Promise.resolve()));
    await userEvent.type(screen.getByLabelText(/Cédula \/ RUC/), '0102030400{Enter}');
    expect(await screen.findByText(/Cliente nuevo/)).toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/Nombres/), 'Ana');
    await userEvent.type(screen.getByLabelText(/Apellidos/), 'Mora');

    await userEvent.selectOptions(screen.getByLabelText(/Marca/), await screen.findByRole('option', { name: 'Samsung' }));
    await userEvent.selectOptions(screen.getByLabelText(/Modelo/), await screen.findByRole('option', { name: 'A10' }));

    await userEvent.click(screen.getByRole('button', { name: /Motivo de ingreso/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cambio de display' }));
    // The display type appears only for a display change.
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de display/), 'OLED');

    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByRole('textbox', { name: /^PIN/ }), '12a34');

    const cost = screen.getByLabelText(/Costo de reparación/);
    await userEvent.clear(cost);
    await userEvent.type(cost, '80');
    const advance = screen.getByLabelText(/Anticipo/);
    await userEvent.clear(advance);
    await userEvent.type(advance, '20');
    expect(screen.getByTestId('form-saldo')).toHaveTextContent('60,00');

    await userEvent.click(screen.getByRole('button', { name: 'Crear orden' }));
    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0]).toMatchObject({
      cliente: { identificacion: '0102030400', nombre: 'Ana', apellido: 'Mora', celular: null },
      marca_id: 1,
      modelo_id: 2,
      motivo_ingreso: 'CAMBIO_DISPLAY',
      tipo_display: 'OLED',
      tipo_garantia: 'SIN_GARANTIA',
      bloqueo_tipo: 'PIN',
      bloqueo_valor: '1234',
      presupuesto: '80.00',
      anticipo: '20.00',
    });
  });
});

describe('PublicWorkOrderPage', () => {
  const renderAt = (codigo: string) =>
    renderWithProviders(
      <Routes>
        <Route path="/orden/:codigo" element={<PublicWorkOrderPage />} />
      </Routes>,
      { route: `/orden/${codigo}`, auth: fakeAuth({ status: 'anonymous', user: null }) },
    );

  it('shows the status of the order without login', async () => {
    renderAt('abc');
    expect(await screen.findByText('Orden #000015')).toBeInTheDocument();
    expect(screen.getByText('Recibido')).toBeInTheDocument();
    expect(screen.getByText('Cambio de display (OLED)')).toBeInTheDocument();
  });

  it('reports an unknown code', async () => {
    renderAt('nope');
    expect(await screen.findByText('Orden no encontrada')).toBeInTheDocument();
  });
});
