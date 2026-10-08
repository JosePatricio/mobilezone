import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { salesMood } from '../services/settingsApi';
import { SettingsPage } from './SettingsPage';

const api = vi.hoisted(() => ({ salesGoals: vi.fn(), updateSalesGoals: vi.fn() }));
vi.mock('../services/settingsApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/settingsApi')>()),
  settingsApi: api,
}));

beforeEach(() => {
  vi.clearAllMocks();
  api.salesGoals.mockResolvedValue({ baja: '20.00', alta: '50.00' });
  api.updateSalesGoals.mockImplementation((body: object) => Promise.resolve(body));
});

describe('salesMood', () => {
  const goals = { baja: '20.00', alta: '50.00' };
  it('picks the emoji by the amount sold today', () => {
    expect(salesMood('19.99', goals).emoji).toBe('😞');
    expect(salesMood('20.00', goals).emoji).toBe('😊');
    expect(salesMood('50.00', goals).emoji).toBe('😊');
    expect(salesMood('50.01', goals).emoji).toBe('🤑');
  });
});

describe('SettingsPage (Metas de venta)', () => {
  it('saves the goals', async () => {
    renderWithProviders(<SettingsPage />);
    const low = await screen.findByLabelText(/Meta baja/);
    expect(low).toHaveValue('20.00');
    await userEvent.clear(low);
    await userEvent.type(low, '30');
    const high = screen.getByLabelText(/Meta alta/);
    await userEvent.clear(high);
    await userEvent.type(high, '80');
    expect(screen.getByText(/Más de \$ 80,00/)).toBeInTheDocument(); // live preview
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    await waitFor(() => expect(api.updateSalesGoals).toHaveBeenCalled());
    expect(api.updateSalesGoals.mock.calls[0][0]).toEqual({ baja: '30.00', alta: '80.00' });
    expect(await screen.findByText('Metas guardadas.')).toBeInTheDocument();
  });

  it('the high goal must be greater than the low one', async () => {
    renderWithProviders(<SettingsPage />);
    const high = await screen.findByLabelText(/Meta alta/);
    await userEvent.clear(high);
    await userEvent.type(high, '10');
    await userEvent.click(screen.getByRole('button', { name: 'Guardar' }));
    expect(await screen.findByText('Debe ser mayor que la meta baja')).toBeInTheDocument();
    expect(api.updateSalesGoals).not.toHaveBeenCalled();
  });
});
