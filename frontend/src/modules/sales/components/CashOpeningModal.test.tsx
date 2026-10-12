import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { fakeAuth, renderWithProviders, testUser } from '@/test/utils';
import type { CashOpening, CashOpeningRequest } from '../types';
import { CashOpeningModal } from './CashOpeningModal';

const api = vi.hoisted(() => ({ todayCashOpening: vi.fn(), openCash: vi.fn() }));
vi.mock('../services/saleApi', () => ({ SALES_KEY: 'sales', saleApi: api }));

const opening = (body: CashOpeningRequest): CashOpening => ({
  id: 1,
  user_id: 1,
  branch_id: body.branch_id,
  branch: { id: body.branch_id, nombre: body.branch_id === 2 ? 'Norte' : 'Matriz' },
  fecha: '2026-10-10',
  monto_inicial: body.monto_inicial,
  created_at: '2026-10-10T13:00:00Z',
});

const seller = (branches = [{ id: 1, nombre: 'Matriz' }, { id: 2, nombre: 'Norte' }]) =>
  fakeAuth({ permissionCodes: ['sales.create', 'sales.view'], user: { ...testUser, branches } });

beforeEach(() => {
  api.todayCashOpening.mockReset().mockResolvedValue(null);
  api.openCash.mockReset().mockImplementation((body: CashOpeningRequest) => Promise.resolve(opening(body)));
});

describe('CashOpeningModal', () => {
  it('asks the branch and the cash in the register the first time of the day', async () => {
    renderWithProviders(<CashOpeningModal />, { auth: seller() });
    const dialog = await screen.findByRole('dialog', { name: 'Apertura de caja' });
    expect(screen.queryByRole('button', { name: 'Cerrar' })).not.toBeInTheDocument();

    // Matriz comes selected by default.
    expect(screen.getByLabelText(/¿En qué sucursal estás\?/)).toHaveValue('1');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    expect(dialog).toHaveTextContent('Ingrese el efectivo en caja');
    expect(api.openCash).not.toHaveBeenCalled();

    await userEvent.selectOptions(screen.getByLabelText(/¿En qué sucursal estás\?/), 'Norte');
    await userEvent.type(screen.getByLabelText(/¿Cuánto tienes en caja\?/), '25,5');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));

    await waitFor(() => expect(api.openCash).toHaveBeenCalledWith({ branch_id: 2, monto_inicial: '25.50' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(await screen.findByText('Caja abierta en Norte con $ 25,50.')).toBeInTheDocument();
  });

  it('preselects the only assigned branch', async () => {
    renderWithProviders(<CashOpeningModal />, { auth: seller([{ id: 2, nombre: 'Norte' }]) });
    expect(await screen.findByLabelText(/¿En qué sucursal estás\?/)).toHaveValue('2');
  });

  it('asks for the branch when the user does not work in Matriz', async () => {
    renderWithProviders(<CashOpeningModal />, {
      auth: seller([
        { id: 2, nombre: 'Norte' },
        { id: 3, nombre: 'Sur' },
      ]),
    });
    const dialog = await screen.findByRole('dialog', { name: 'Apertura de caja' });
    expect(screen.getByLabelText(/¿En qué sucursal estás\?/)).toHaveValue('');
    await userEvent.click(screen.getByRole('button', { name: 'Abrir caja' }));
    expect(dialog).toHaveTextContent('Seleccione la sucursal.');
    expect(api.openCash).not.toHaveBeenCalled();
  });

  it('is not shown when the register was already opened today', async () => {
    api.todayCashOpening.mockResolvedValue(opening({ branch_id: 1, monto_inicial: '10.00' }));
    renderWithProviders(<CashOpeningModal />, { auth: seller() });
    await waitFor(() => expect(api.todayCashOpening).toHaveBeenCalled());
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('is not shown to users who cannot sell', async () => {
    renderWithProviders(<CashOpeningModal />, { auth: fakeAuth({ permissionCodes: ['sales.view'] }) });
    await new Promise((r) => setTimeout(r, 20));
    expect(api.todayCashOpening).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});
