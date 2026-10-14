import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { OrderClient } from '../types';
import { MarketingPage } from './MarketingPage';

const api = vi.hoisted(() => ({ recipients: vi.fn() }));
vi.mock('../services/marketingApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/marketingApi')>()),
  marketingApi: api,
}));

const client = (id: number, nombre: string, marca: string, celular: string | null): OrderClient => ({
  cliente_id: id,
  nombre,
  apellido: 'Pérez',
  celular,
  marca,
  modelo: 'M1',
  ordenes: 1,
  ultima_orden: '2026-10-01',
});

beforeEach(() => {
  vi.clearAllMocks();
  api.recipients.mockResolvedValue([
    client(1, 'Ana', 'Samsung', '0991111111'),
    client(2, 'Luis', 'Xiaomi', '0992222222'),
    client(3, 'Eva', 'Apple', null),
  ]);
});

/** jsdom has no editing commands: the text is written into the editor as the browser would. */
function write(html: string) {
  const editor = screen.getByRole('textbox', { name: 'Mensaje' });
  editor.innerHTML = html;
  fireEvent.input(editor);
}

describe('MarketingPage (Propaganda › CRM)', () => {
  it('asks WhatsApp or SMS and prepares one message per client of the orders', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);

    await user.click(screen.getByRole('button', { name: 'CRM' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'WhatsApp' }));

    expect(screen.getByRole('group', { name: 'Agregar video o imagen' })).toBeInTheDocument();
    expect(await screen.findByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Incluir a Eva Pérez' })).toBeDisabled(); // no celular

    write('Hola <b>@NOMBRE</b>, promo para tu @TELEFONO a 430$.');
    expect(within(screen.getByLabelText('Vista previa del mensaje')).getByText('Ana')).toBeInTheDocument();

    await user.click(screen.getByRole('checkbox', { name: 'Incluir a Luis Pérez' }));
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));

    expect(screen.getByText('Mensajes preparados (1)')).toBeInTheDocument();
    expect(screen.getByText('Hola *Ana*, promo para tu Samsung a 430$.')).toBeInTheDocument();
  });

  it('SMS messages are plain text and an empty text is rejected', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'CRM' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'SMS' }));
    await screen.findByText('Ana Pérez');

    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escriba el texto del mensaje.');

    write('<b>@NOMBRE</b> tu @TELEFONO');
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));
    expect(screen.getByText('Mensajes preparados (2)')).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText('Ana tu Samsung')).toBeInTheDocument();
    expect(within(list).getByText('Luis tu Xiaomi')).toBeInTheDocument();
  });

  it('filters the clients by the brand of the phone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'CRM' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'WhatsApp' }));
    await screen.findByText('Ana Pérez');

    await user.selectOptions(screen.getByRole('combobox', { name: 'Marca del teléfono' }), 'Xiaomi');
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('1 de 3 cliente(s) seleccionado(s)')).toBeInTheDocument();
  });
});
