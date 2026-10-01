import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import type { ClientRequest } from '@/modules/clients/types';
import type { InventoryItem } from '@/modules/inventory/types';
import { ApiError } from '@/shared/services/apiError';
import { fakeAuth, renderWithProviders } from '@/test/utils';
import type { CreateSaleRequest } from '../types';
import { NewSalePage } from './NewSalePage';

const inventory = (id: number, nombre: string, precio_venta: string, stock: number, sku = `SKU-${id}`): InventoryItem => ({
  id,
  product_id: id * 10,
  product: { id: id * 10, sku, nombre, precio_venta, imagen_url: null, estado: true },
  branch_id: 1,
  branch: { id: 1, nombre: 'Matriz' },
  stock,
  updated_at: '2026-01-01T00:00:00Z',
});
const stockMatriz = [inventory(1, 'Pantalla A', '10.00', 15, 'PAN-A'), inventory(2, 'Pantalla B', '25.00', 3, 'PAN-B')];

const customer = {
  id: 7,
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'juan@example.com',
  identificacion: '1712345675',
  celular: '0991234567',
  provincia: 'Pichincha',
  ciudad: 'Quito',
  foto_url: null,
  estado: true,
};

const inventoryCalls: Record<string, unknown>[] = [];
vi.mock('@/modules/inventory/services/inventoryApi', () => ({
  INVENTORY_KEY: 'inventory',
  inventoryApi: {
    list: (params: Record<string, unknown>) => {
      inventoryCalls.push(params);
      const term = String(params.search ?? '').toLowerCase();
      const items = stockMatriz.filter(
        (i) => i.product.sku.toLowerCase().includes(term) || i.product.nombre.toLowerCase().includes(term),
      );
      return Promise.resolve({ items, total: items.length, page: 1, size: 10, pages: 1 });
    },
  },
}));

// Provinces / cities come from GET /locations/provinces.
vi.mock('@/shared/services/httpClient', () => ({
  http: {
    get: (url: string) =>
      url === '/locations/provinces'
        ? Promise.resolve({ data: [{ nombre: 'Pichincha', ciudades: ['Quito', 'Cayambe'] }] })
        : Promise.reject(new Error(`unexpected GET ${url}`)),
  },
  onUnauthorized: () => () => undefined,
}));

// Plain functions (not vi.fn) so rejected promises are not tracked by a spy.
const saleCalls: CreateSaleRequest[] = [];
const createdCustomers: ClientRequest[] = [];
let confirmImpl: (body: CreateSaleRequest) => Promise<unknown> = () => new Promise(() => {});
vi.mock('../services/saleApi', () => ({
  SALES_KEY: 'sales',
  saleApi: {
    confirm: (body: CreateSaleRequest) => {
      saleCalls.push(body);
      return confirmImpl(body);
    },
    lookupCustomer: (identificacion: string) =>
      identificacion === customer.identificacion
        ? Promise.resolve(customer)
        : Promise.reject(new ApiError(404, 'CLIENT_NOT_FOUND', 'No se encontró ningún cliente con esa cédula / RUC.')),
    receipt: () => Promise.resolve(new Blob(['%PDF-1.4'], { type: 'application/pdf' })),
    createCustomer: (body: ClientRequest) => {
      createdCustomers.push(body);
      return Promise.resolve({ ...customer, ...body, id: 8 });
    },
  },
}));

const seller = fakeAuth({ permissionCodes: ['sales.create', 'sales.view', 'products.view', 'inventory.view'] });

function renderPage() {
  return renderWithProviders(<NewSalePage />, { auth: seller });
}

async function searchProduct(term: string) {
  const input = screen.getByRole('textbox', { name: 'Buscar producto' });
  await userEvent.clear(input);
  await userEvent.type(input, `${term}{Enter}`);
}

async function confirmSale() {
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
}

describe('NewSalePage', () => {
  beforeEach(() => {
    saleCalls.length = 0;
    createdCustomers.length = 0;
    inventoryCalls.length = 0;
    confirmImpl = () => new Promise(() => {});
  });

  it('searches in the seller branch with Enter and shows image, SKU, name, quantity, stock and price', async () => {
    renderPage();
    await searchProduct('pan-a');
    expect(inventoryCalls[0]).toMatchObject({ branch_id: 1, search: 'pan-a', active: true });

    const row = screen.getByLabelText('Cantidad de Pantalla A').closest('tr')!;
    expect(within(row).getByText('PAN-A')).toBeInTheDocument();
    expect(within(row).getByText('Pantalla A')).toBeInTheDocument();
    expect(within(row).getByText('15')).toBeInTheDocument(); // stock
    expect(within(row).getByRole('button', { name: 'Ver imagen de Pantalla A' })).toBeInTheDocument();

    await userEvent.click(within(row).getByRole('button', { name: 'Agregar una unidad de Pantalla A' }));
    await userEvent.click(within(row).getByRole('button', { name: 'Agregar una unidad de Pantalla A' }));
    expect(screen.getByLabelText('Cantidad de Pantalla A')).toHaveValue(3);
    await userEvent.click(within(row).getByRole('button', { name: 'Quitar una unidad de Pantalla A' }));
    expect(screen.getByLabelText('Cantidad de Pantalla A')).toHaveValue(2);
    expect(screen.getByTestId('sale-total')).toHaveTextContent('20,00');
  });

  it('lists several matches to choose and opens the image large', async () => {
    renderPage();
    await searchProduct('pantalla');
    const results = await screen.findByRole('list', { name: 'Resultados de la búsqueda' });
    await userEvent.click(within(results).getByText('Pantalla B'));
    expect(screen.getByLabelText('Cantidad de Pantalla B')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Ver imagen de Pantalla B' }));
    expect(await screen.findByRole('dialog', { name: 'Pantalla B' })).toBeInTheDocument();
  });

  it('offers the Inventario module when the product is not in the branch', async () => {
    renderPage();
    await searchProduct('cargador');
    expect(await screen.findByText(/No se encontró “cargador” en la sucursal Matriz/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Buscar en otras sucursales/ })).toHaveAttribute(
      'href',
      '/inventory?search=cargador',
    );
  });

  it('shows a clear message on INSUFFICIENT_STOCK from the backend', async () => {
    confirmImpl = () =>
      Promise.reject(
        new ApiError(409, 'INSUFFICIENT_STOCK', "Stock insuficiente para el producto 'Pantalla B'.", {
          product_id: 20,
          available: 0,
          requested: 1,
        }),
      );
    renderPage();
    await searchProduct('pan-b');
    await confirmSale();

    expect(await screen.findByText(/Stock insuficiente para el producto 'Pantalla B'/)).toBeInTheDocument();
    expect(saleCalls).toEqual([
      {
        branch_id: 1,
        items: [{ inventory_id: 2, cantidad: 1 }],
        factura: false,
        cliente_id: null,
        metodo_pago: 'EFECTIVO',
        monto_recibido: null,
      },
    ]);
    expect(screen.getByText('Supera el stock disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
  });

  it('defaults to Consumidor final without a user icon', () => {
    renderPage();
    expect(screen.getByLabelText('Cliente')).toHaveValue('Consumidor final');
    expect(screen.queryByRole('button', { name: 'Consumidor final' })).not.toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Tipo de documento' })).not.toBeChecked();
  });

  it('selects a client by cédula and shows "name, cédula, phone" in the field', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('switch', { name: 'Tipo de documento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    await userEvent.type(within(modal).getByLabelText('Cédula o RUC'), '1712345675{Enter}');
    expect(await within(modal).findByText('Juan Pérez')).toBeInTheDocument();
    await userEvent.click(within(modal).getByRole('button', { name: 'Seleccionar' }));

    expect(screen.getByLabelText('Cliente')).toHaveValue('Juan Pérez, 1712345675, 0991234567');
    expect(screen.queryByText(/Cédula \/ RUC:/)).not.toBeInTheDocument();

    await searchProduct('pan-a');
    await confirmSale();
    expect(saleCalls).toEqual([
      {
        branch_id: 1,
        items: [{ inventory_id: 1, cantidad: 1 }],
        factura: true,
        cliente_id: 7,
        metodo_pago: 'EFECTIVO',
        monto_recibido: null,
      },
    ]);

    await userEvent.click(screen.getByRole('button', { name: 'Quitar cliente (Consumidor final)' }));
    expect(screen.getByLabelText('Cliente')).toHaveValue('Consumidor final');
  });

  it('registers a new client (role CLIENTE) from the modal when it does not exist', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    await userEvent.type(within(modal).getByLabelText('Cédula o RUC'), '0102030400{Enter}');
    await userEvent.click(await within(modal).findByRole('button', { name: 'Registrar nuevo cliente' }));

    const form = within(modal).getByRole('form', { name: 'Registrar cliente' });
    expect(within(form).getByText('CLIENTE')).toBeInTheDocument();
    expect(within(form).queryByLabelText(/Contraseña/)).not.toBeInTheDocument();
    await userEvent.type(within(form).getByLabelText(/Nombre/), 'Ana');
    await userEvent.type(within(form).getByLabelText(/Apellido/), 'Loor');
    await userEvent.type(within(form).getByLabelText(/Email/), 'ana@example.com');
    await userEvent.type(within(form).getByLabelText('Celular'), '0987654321');
    await within(form).findByRole('option', { name: 'Pichincha' });
    await userEvent.selectOptions(within(form).getByLabelText('Provincia'), 'Pichincha');
    await userEvent.selectOptions(within(form).getByLabelText('Ciudad'), 'Quito');
    await userEvent.click(within(form).getByRole('button', { name: 'Registrar cliente' }));

    expect(createdCustomers[0]).toMatchObject({
      nombre: 'Ana',
      apellido: 'Loor',
      identificacion: '0102030400',
      provincia: 'Pichincha',
      ciudad: 'Quito',
    });
    await userEvent.click(within(modal).getByRole('button', { name: 'Seleccionar' }));
    expect(screen.getByLabelText('Cliente')).toHaveValue('Ana Loor, 0102030400, 0987654321');
  });

  it('rejects an invalid cédula before calling the API', async () => {
    renderPage();
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    await userEvent.type(within(modal).getByLabelText('Cédula o RUC'), '1712345678{Enter}');
    expect(await within(modal).findByRole('alert')).toHaveTextContent('no es válido');
  });

  it('asks for a branch when the seller has none', () => {
    renderWithProviders(<NewSalePage />, {
      auth: fakeAuth({ permissionCodes: ['sales.create'], user: { ...seller.user!, branches: [] } }),
    });
    expect(screen.getByText('Sin sucursal asignada')).toBeInTheDocument();
  });

  it('card payment adds 6 % and cash shows the change', async () => {
    renderPage();
    await searchProduct('pan-b'); // 25.00
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const dialog = await screen.findByRole('alertdialog', { name: 'Confirmar venta' });
    expect(within(dialog).getByTestId('payment-total')).toHaveTextContent('25,00');

    await userEvent.click(within(dialog).getByRole('radio', { name: /Tarjeta de crédito/ }));
    expect(within(dialog).getByTestId('payment-total')).toHaveTextContent('26,50');
    expect(within(dialog).getByText(/recargo tarjeta 6 %/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('radio', { name: 'Efectivo' }));
    const recibido = within(dialog).getByLabelText('Monto recibido');
    await userEvent.type(recibido, '20');
    expect(within(dialog).getByText('El monto recibido no cubre el total')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
    await userEvent.clear(recibido);
    await userEvent.type(recibido, '30');
    expect(within(dialog).getByTestId('payment-change')).toHaveTextContent('5,00');
    // The previous summary is now a small footer.
    expect(within(dialog).getByText(/Consumidor final en la sucursal Matriz/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
    expect(saleCalls[0]).toMatchObject({ metodo_pago: 'EFECTIVO', monto_recibido: '30.00' });
  });

  it('downloads the PDF receipt after confirming the sale', async () => {
    const createObjectURL = vi.fn(() => 'blob:receipt');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => undefined);
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() });
    confirmImpl = () => Promise.resolve({ id: 42 });
    renderPage();
    await searchProduct('pan-a');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('radio', { name: 'Transferencia' }));
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));

    await vi.waitFor(() => expect(click).toHaveBeenCalled());
    expect(createObjectURL).toHaveBeenCalled();
    expect(saleCalls[0]).toMatchObject({ metodo_pago: 'TRANSFERENCIA', monto_recibido: null });
    click.mockRestore();
  });
});
