import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { ApiError } from '@/shared/services/apiError';
import { renderWithProviders } from '@/test/utils';
import type { CreateSaleRequest } from '../types';
import { NewSalePage } from './NewSalePage';

const products = [
  { id: 1, nombre: 'Producto A', precio: '10.00', stock: 15, estado: true, category_id: 1, category: { id: 1, nombre: 'C' } },
  { id: 2, nombre: 'Producto B', precio: '25.00', stock: 3, estado: true, category_id: 1, category: { id: 1, nombre: 'C' } },
];

vi.mock('@/modules/products/services/productApi', () => ({
  PRODUCTS_KEY: 'products',
  productApi: { list: () => Promise.resolve({ items: products, total: 2, page: 1, size: 10, pages: 1 }) },
}));

// Plain function (not vi.fn) so a rejected promise is not tracked by the spy.
const saleCalls: CreateSaleRequest[] = [];
let confirmImpl: (body: CreateSaleRequest) => Promise<unknown> = () => new Promise(() => {});
vi.mock('../services/saleApi', () => ({
  SALES_KEY: 'sales',
  saleApi: {
    confirm: (body: CreateSaleRequest) => {
      saleCalls.push(body);
      return confirmImpl(body);
    },
  },
}));

async function addProduct(name: string) {
  await userEvent.click(screen.getByLabelText('Buscar producto'));
  const list = await screen.findByRole('listbox');
  await userEvent.click(await within(list).findByText(name));
}

describe('NewSalePage', () => {
  beforeEach(() => {
    saleCalls.length = 0;
  });

  it('adds several products, shows stock and calculates the total', async () => {
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
    await userEvent.click(screen.getByRole('button', { name: 'Confirmar venta' }));
    const dialog = await screen.findByRole('alertdialog');
    await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar venta' }));

    expect(await screen.findByText(/Stock insuficiente para el producto 'Producto B'/)).toBeInTheDocument();
    expect(saleCalls).toEqual([{ items: [{ product_id: 2, cantidad: 1 }] }]);
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
});
