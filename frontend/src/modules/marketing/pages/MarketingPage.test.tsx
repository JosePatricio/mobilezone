import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { Campaign, OrderClient, WhatsAppTemplate } from '../types';
import { MarketingPage } from './MarketingPage';

const api = vi.hoisted(() => ({ recipients: vi.fn(), templates: vi.fn(), campaigns: vi.fn(), campaign: vi.fn(), createCampaign: vi.fn() }));
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
  api.templates.mockResolvedValue([]);
  api.campaigns.mockResolvedValue([]);
});

const promo: WhatsAppTemplate = {
  name: 'promo_octubre',
  language: 'es',
  category: 'MARKETING',
  body: 'Hola {{1}}, oferta para tu {{2}}.',
  header_format: null,
  header_text: null,
  footer: 'Responde BAJA para no recibir más',
  body_params: ['1', '2'],
  unsupported_params: false,
};

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

  it('sends an approved template through the WhatsApp API to the selected clients', async () => {
    api.templates.mockResolvedValue([promo]);
    api.createCampaign.mockResolvedValue({ campaign_id: 7, encolados: 2, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'CRM' }));
    await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'WhatsApp' }));
    await screen.findByText('Ana Pérez');

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_octubre|es');
    // {{1}} = name, {{2}} = brand of the phone by default; previewed with the first client.
    expect(screen.getByText('Hola Ana, oferta para tu Samsung.')).toBeInTheDocument();
    expect(screen.getByText('2 destinatario(s) · costo aprox. $0.15')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));

    expect(api.createCampaign).toHaveBeenCalledWith(
      {
        plantilla: 'promo_octubre',
        idioma: 'es',
        cliente_ids: [1, 2],
        parametros: [{ source: 'NOMBRE' }, { source: 'MARCA' }],
      },
      null,
    );
    expect(await screen.findByText('Enviando 2 mensaje(s).')).toBeInTheDocument();
  });

  it('lists the WhatsApp campaigns with the state of their messages', async () => {
    const campaign: Campaign = {
      id: 7,
      plantilla: 'promo_octubre',
      idioma: 'es',
      categoria: 'MARKETING',
      created_at: '2026-10-14T15:00:00Z',
      creado_por: 'Admin Sistema',
      total: 3,
      pendientes: 0,
      enviados: 0,
      entregados: 1,
      leidos: 1,
      fallidos: 1,
    };
    api.campaigns.mockResolvedValue([campaign]);
    renderWithProviders(<MarketingPage />);

    const row = (await screen.findByText('Admin Sistema')).closest('tr')!;
    // total, pendientes, entregados (delivered + read), leídos, fallidos
    expect([...row.querySelectorAll('td.text-right')].slice(0, 5).map((td) => td.textContent)).toEqual(['3', '0', '2', '1', '1']);
  });
});
