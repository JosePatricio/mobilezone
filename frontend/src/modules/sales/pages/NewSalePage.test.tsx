import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { renderWithProviders } from '@/test/utils';
import type { CreateSaleRequest } from '../types';
import { NewSalePage } from './NewSalePage';

const product = (id: number, nombre: string, precio_venta: string, stock: number) => ({
  id,
  sku: `SKU-${id}`,
  nombre,
  precio_venta,
  precio_costo: '1.00',
  precio_mayor: '2.00',
  stock,
  imagen_url: null,
  estado: true,
  category_id: 1,
  category: { id: 1, nombre: 'C' },
});
const products = [product(1, 'Producto A', '10.00', 15), product(2, 'Producto B', '25.00', 3)];

const customer = {
  id: 7,
  nombre: 'Juan',
  apellido: 'Pérez',
  email: 'juan@example.com',
  identificacion: '1712345678',
  celular: '0991234567',
  ciudad: 'Quito',
  foto_url: null,
  estado: true,
};

vi.mock('@/modules/products/services/productApi', () => ({
  PRODUCTS_KEY: 'products',
  productApi: { list: () => Promise.resolve({ items: products, total: 2, page: 1, size: 10, pages: 1 }) },
}));

// Plain functions (not vi.fn) so rejected promises are not tracked by a spy.
const saleCalls: CreateSaleRequest[] = [];
const lookupCalls: string[] = [];
let confirmImpl: (body: CreateSaleRequest) => Promise<unknown> = () => new Promise(() => {});
vi.mock('../services/saleApi', () => ({
  SALES_KEY: 'sales',
  saleApi: {
    confirm: (body: CreateSaleRequest) => {
      saleCalls.push(body);
      return confirmImpl(body);
    },
    lookupCustomer: (identificacion: string) => {
      lookupCalls.push(identificacion);
      return identificacion === customer.identificacion
        ? Promise.resolve(customer)
        : Promise.reject(new ApiError(404, 'CLIENT_NOT_FOUND', 'No se encontró ningún cliente con esa cédula / RUC.'));
    },
  },
}));

async function addProduct(name: string) {
  await userEvent.click(screen.getByLabelText('Buscar producto'));
  const list = await screen.findByRole('listbox');
  await userEvent.click(await within(list).findByText(name));
}

async function confirmSale() {
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
  const dialog = await screen.findByRole('alertdialog');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));
}

describe('NewSalePage', () => {
  beforeEach(() => {
    saleCalls.length = 0;
    lookupCalls.length = 0;
    confirmImpl = () => new Promise(() => {});
  });

  it('adds several products at PVP, shows stock and calculates the total', async () => {
    renderWithProviders(<NewSalePage />);
    await addProduct('Producto A');
    await addProduct('Producto B');
    const qtyA = screen.getByLabelText('Cantidad de Producto A');
    await userEvent.clear(qtyA);
    await userEvent.type(qtyA, '2');
    expect(screen.getByTestId('sale-total')).toHaveTextContent('45,00');
    const rowB = screen.getByLabelText('Cantidad de Producto B').closest('tr')!;
    expect(within(rowB).getByText('3')).toBeInTheDocument();
  });

  it('shows a clear message on INSUFFICIENT_STOCK from the backend', async () => {
    confirmImpl = () =>
      Promise.reject(
        new ApiError(409, 'INSUFFICIENT_STOCK', "Stock insuficiente para el producto 'Producto B'.", {
          product_id: 2,
          available: 0,
          requested: 1,
        }),
      );
    renderWithProviders(<NewSalePage />);
    await addProduct('Producto B');
    await confirmSale();

    expect(await screen.findByText(/Stock insuficiente para el producto 'Producto B'/)).toBeInTheDocument();
    expect(saleCalls).toEqual([{ items: [{ product_id: 2, cantidad: 1 }], factura: false, cliente_id: null }]);
    expect(screen.getByText('Supera el stock disponible')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Confirmar venta' })).toBeDisabled();
  });

  it('requires confirmation before registering the sale', async () => {
    renderWithProviders(<NewSalePage />);
    await addProduct('Producto A');
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancelar' }));
    expect(saleCalls).toEqual([]);
  });

  it('defaults to comprobante for consumidor final', () => {
    renderWithProviders(<NewSalePage />);
    expect(screen.getByLabelText('Cliente')).toHaveValue('Consumidor final');
    expect(screen.getByRole('switch', { name: 'Tipo de documento' })).not.toBeChecked();
  });

  it('finds a client by cédula with Enter, selects it and issues a factura', async () => {
    renderWithProviders(<NewSalePage />);
    await userEvent.click(screen.getByRole('switch', { name: 'Tipo de documento' }));
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));

    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    const select = within(modal).getByRole('button', { name: 'Seleccionar' });
    expect(select).toBeDisabled();
    await userEvent.type(within(modal).getByLabelText('Cédula o RUC'), '1712345678{Enter}');

    expect(await within(modal).findByText('Juan Pérez')).toBeInTheDocument();
    expect(within(modal).getByText('Quito')).toBeInTheDocument();
    expect(lookupCalls).toEqual(['1712345678']);
    await userEvent.click(select);

    expect(screen.queryByRole('dialog', { name: 'Buscar cliente' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('Cliente')).toHaveValue('Juan Pérez');

    await addProduct('Producto A');
    await confirmSale();
    expect(saleCalls).toEqual([{ items: [{ product_id: 1, cantidad: 1 }], factura: true, cliente_id: 7 }]);
  });

  it('shows an error when the client does not exist and validates the format', async () => {
    renderWithProviders(<NewSalePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    const input = within(modal).getByLabelText('Cédula o RUC');

    await userEvent.type(input, '123{Enter}');
    expect(await within(modal).findByRole('alert')).toHaveTextContent('10 dígitos');
    expect(lookupCalls).toEqual([]);

    await userEvent.clear(input);
    await userEvent.type(input, '0999999999{Enter}');
    expect(await within(modal).findByRole('alert')).toHaveTextContent('No se encontró');
    expect(within(modal).getByRole('button', { name: 'Seleccionar' })).toBeDisabled();
  });

  it('the user icon sets Consumidor final', async () => {
    renderWithProviders(<NewSalePage />);
    await userEvent.click(screen.getByRole('button', { name: 'Buscar cliente por cédula o RUC' }));
    const modal = await screen.findByRole('dialog', { name: 'Buscar cliente' });
    await userEvent.type(within(modal).getByLabelText('Cédula o RUC'), '1712345678{Enter}');
    await within(modal).findByText('Juan Pérez');
    await userEvent.click(within(modal).getByRole('button', { name: 'Seleccionar' }));
    expect(screen.getByLabelText('Cliente')).toHaveValue('Juan Pérez');

    await userEvent.click(screen.getByRole('button', { name: 'Consumidor final' }));
    expect(screen.getByLabelText('Cliente')).toHaveValue('Consumidor final');
  });
});
