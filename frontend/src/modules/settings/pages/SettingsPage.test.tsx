import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { SettingsPage } from './SettingsPage';

const resetData = vi.fn((_: string) => Promise.resolve({ eliminados: { ordenes: 2, productos: 3 } }));
vi.mock('../services/settingsApi', () => ({ settingsApi: { resetData: (c: string) => resetData(c) } }));

describe('SettingsPage', () => {
  it('empties the data only after typing the confirmation word', async () => {
    renderWithProviders(<SettingsPage />);
    await userEvent.click(screen.getByRole('button', { name: 'Vaciar todos los datos' }));
    const dialog = screen.getByRole('alertdialog', { name: '¿Vaciar todos los datos?' });
    const confirm = within(dialog).getByRole('button', { name: 'Vaciar datos' });
    expect(confirm).toBeDisabled();

    await userEvent.type(within(dialog).getByLabelText(/Escriba VACIAR/), 'vaciar');
    expect(within(dialog).getByLabelText(/Escriba VACIAR/)).toHaveValue('vaciar');
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(resetData).toHaveBeenCalledWith('vaciar');
    expect(await screen.findByText('Datos vaciados: 5 registros eliminados.')).toBeInTheDocument();
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});
