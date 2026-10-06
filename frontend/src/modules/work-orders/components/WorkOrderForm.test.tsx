import { fireEvent, screen, within } from '@testing-library/react';
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
  garantia_dias: 30,
  fecha_entrega: '2026-10-05T21:30:00Z',
  presupuesto: '80.00',
  anticipo: '20.00',
  saldo: '60.00',
  updated_at: '2026-10-01T21:20:00Z',
};

const createdCustomers: Record<string, unknown>[] = [];
vi.mock('@/shared/components/LocationFields', () => ({ LocationFields: () => null, useProvinces: () => ({ isSuccess: true }) }));
vi.mock('../services/workOrderApi', () => ({
  WORK_ORDERS_KEY: 'work-orders',
  workOrderApi: {
    catalogs: () => Promise.resolve(catalogs),
    statuses: () => Promise.resolve(catalogs.estados),
    createCustomer: (body: Record<string, unknown>) => {
      createdCustomers.push(body);
      return Promise.resolve({ id: 9, email: null, foto_url: null, estado: true, ...body });
    },
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
const devices = vi.hoisted(() => ({
  brands: vi.fn(() => Promise.resolve({ items: [{ id: 1, nombre: 'Samsung' }], total: 1, page: 1, size: 100, pages: 1 })),
  models: vi.fn(() => Promise.resolve({ items: [{ id: 2, nombre: 'A10' }], total: 1, page: 1, size: 100, pages: 1 })),
}));
vi.mock('@/modules/brands/services/brandApi', () => ({ BRANDS_KEY: 'brands', brandApi: { list: devices.brands } }));
vi.mock('@/modules/models/services/modelApi', () => ({ MODELS_KEY: 'models', modelApi: { list: devices.models } }));
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
    // The client has no email: it can be entered here.
    expect(screen.getByLabelText(/^Email/)).not.toHaveAttribute('readonly');
    // The logged user is the technician; there is no date field (today), only the delivery date.
    expect(screen.getByText('Ana Pérez (usted)')).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Fecha\s*\*?$/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Fecha de entrega')).toHaveAttribute('type', 'datetime-local');
  });

  it('queries brands and models again every time a selector is opened', async () => {
    renderForm();
    const marca = screen.getByLabelText(/^Marca/);
    await screen.findByRole('option', { name: 'Samsung' });
    await userEvent.selectOptions(marca, '1');
    await screen.findByRole('option', { name: 'A10' });
    const brandCalls = devices.brands.mock.calls.length;
    const modelCalls = devices.models.mock.calls.length;

    fireEvent.mouseDown(screen.getByLabelText(/^Modelo\s*\*?$/));
    await vi.waitFor(() => expect(devices.brands.mock.calls.length).toBe(brandCalls + 1));
    expect(devices.models.mock.calls.length).toBe(modelCalls + 1);
  });

  it('chooses the color from the palette', async () => {
    const onSubmit = renderForm(vi.fn(() => Promise.resolve()));
    await userEvent.click(screen.getByRole('radio', { name: 'Azul' }));
    expect(screen.getByRole('radio', { name: 'Azul' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText('Color: Azul')).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('registers a new client and sends the full order', async () => {
    const onSubmit = renderForm(vi.fn(() => Promise.resolve()));
    await userEvent.type(screen.getByLabelText(/Cédula \/ RUC/), '0102030400{Enter}');
    // Not registered: the same registration form as in sales opens in a modal.
    const modal = await screen.findByRole('dialog', { name: 'Nuevo cliente' });
    expect(within(modal).getByLabelText(/Cédula o RUC/)).toHaveValue('0102030400');
    // The role is always CLIENTE, so the work order form does not show it.
    expect(within(modal).queryByText('Rol')).not.toBeInTheDocument();
    await userEvent.type(within(modal).getByLabelText(/^Nombre/), 'Ana');
    await userEvent.type(within(modal).getByLabelText(/^Apellido/), 'Mora');
    await userEvent.click(within(modal).getByRole('button', { name: 'Registrar cliente' }));
    await vi.waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(createdCustomers[0]).toMatchObject({
      identificacion: '0102030400',
      nombre: 'Ana',
      apellido: 'Mora',
      provincia: 'Pichincha',
      ciudad: 'Quito',
    });
    expect(screen.getByLabelText(/Nombres/)).toHaveValue('Ana');

    await userEvent.click(screen.getByRole('radio', { name: 'Negro' }));
    await userEvent.type(screen.getByLabelText(/Modelo técnico/), 'SM-A105M');
    await userEvent.type(screen.getByLabelText(/^Email/), 'ana@example.com');

    await userEvent.selectOptions(screen.getByLabelText(/Marca/), await screen.findByRole('option', { name: 'Samsung' }));
    await userEvent.selectOptions(screen.getByRole('combobox', { name: /^Modelo/ }), await screen.findByRole('option', { name: 'A10' }));

    await userEvent.click(screen.getByRole('button', { name: /Motivo de ingreso/ }));
    await userEvent.click(await screen.findByRole('option', { name: 'Cambio de display' }));
    // The display type appears only for a display change.
    await userEvent.selectOptions(screen.getByLabelText(/Tipo de display/), 'OLED');

    const warranty = screen.getByLabelText(/Tiempo de garantía/);
    await userEvent.clear(warranty);
    await userEvent.type(warranty, '90');

    await userEvent.click(screen.getByRole('radio', { name: 'PIN' }));
    await userEvent.type(screen.getByRole('textbox', { name: /^PIN/ }), '12a34');
    fireEvent.change(screen.getByLabelText('Fecha de entrega'), { target: { value: '2026-10-05T16:30' } });

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
      cliente: { identificacion: '0102030400', nombre: 'Ana', apellido: 'Mora', celular: null, email: 'ana@example.com' },
      modelo_tecnico: 'SM-A105M',
      marca_id: 1,
      modelo_id: 2,
      motivo_ingreso: 'CAMBIO_DISPLAY',
      tipo_display: 'OLED',
      color: 'Negro',
      garantia_dias: 90,
      bloqueo_tipo: 'PIN',
      bloqueo_valor: '1234',
      presupuesto: '80.00',
      anticipo: '20.00',
      fecha_entrega: new Date(2026, 9, 5, 16, 30).toISOString(),
    });
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty('tecnico_id');
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
    expect(screen.getByText('30 días')).toBeInTheDocument();
  });

  it('reports an unknown code', async () => {
    renderAt('nope');
    expect(await screen.findByText('Orden no encontrada')).toBeInTheDocument();
  });
});
