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
  it('opens with "Enviar propaganda" and prepares one WhatsApp message per client of the orders', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);

    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));

    expect(screen.getByRole('group', { name: 'Agregar imagen' })).toBeInTheDocument();
    expect(await screen.findByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Incluir a Eva Pérez' })).toBeDisabled(); // no celular

    write('Hola <b>@NOMBRE</b>, promo para tu @TELEFONO a 430$.');
    expect(within(screen.getByLabelText('Vista previa del mensaje')).getByText('Ana')).toBeInTheDocument();

    // Nobody is checked at first.
    expect(screen.getByRole('checkbox', { name: 'Incluir a Luis Pérez' })).not.toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'Incluir a Ana Pérez' }));
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));

    expect(screen.getByText('Mensajes preparados (1)')).toBeInTheDocument();
    expect(screen.getByText('Hola *Ana*, promo para tu Samsung a 430$.')).toBeInTheDocument();
  });

  it('rejects an empty text and selects every client of the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await screen.findByText('Ana Pérez');

    // Starts with the text of the promo template.
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveTextContent(
      '¡Hola @NOMBRE! 📱 llegaron MICAS con DISEÑO para tu @TELEFONO',
    );
    write('');
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Escriba el texto del mensaje.');

    write('<b>@NOMBRE</b> tu @TELEFONO');
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Seleccione al menos un cliente con celular.');

    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));
    await user.click(screen.getByRole('button', { name: 'Preparar mensajes' }));
    expect(screen.getByText('Mensajes preparados (2)')).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(within(list).getByText('*Ana* tu Samsung')).toBeInTheDocument();
    expect(within(list).getByText('*Luis* tu Xiaomi')).toBeInTheDocument();
  });

  it('searches by cédula and by the mobile in any format', async () => {
    api.recipients.mockResolvedValue([
      { ...client(1, 'Ana', 'Samsung', '+593960911155'), identificacion: '1712345678' },
      { ...client(2, 'Luis', 'Xiaomi', '0992222222'), identificacion: '0912345678' },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await screen.findByText('Ana Pérez');
    const search = screen.getByPlaceholderText('Buscar por nombre, cédula o celular…');

    await user.type(search, '1712345678');
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Luis Pérez')).not.toBeInTheDocument();

    // Stored as +593960911155, typed as a local number.
    await user.clear(search);
    await user.type(search, '0960911155');
    expect(screen.getByText('Ana Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Luis Pérez')).not.toBeInTheDocument();
  });

  it('shows one row per number, 10 per page, with the history of the repeated ones', async () => {
    api.recipients.mockResolvedValue([
      ...Array.from({ length: 16 }, (_, i) => client(i + 1, `Cliente${i + 1}`, 'Samsung', `09900000${String(i + 10)}`)),
      client(17, 'Ana', 'Samsung', '0991111111'),
      { ...client(18, 'Luis', 'Xiaomi', '+593991111111'), ultima_orden: '2026-10-05' },
    ]);
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));

    expect(await screen.findByText('Cliente1 Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Cliente11 Pérez')).not.toBeInTheDocument();
    expect(screen.getByText(/17 registros · Página 1 de 2/)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Siguiente ›' }));
    expect(screen.getByText('Cliente11 Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Cliente1 Pérez')).not.toBeInTheDocument();

    // 0991111111 and +593991111111 are the same phone: one row, for the client of the latest order.
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Historial de +593991111111' }));
    const history = screen.getByRole('dialog', { name: 'Historial de +593991111111' });
    expect(within(history).getByText('Ana Pérez')).toBeInTheDocument();
    expect(within(history).getByText('Luis Pérez')).toBeInTheDocument();
    await user.click(within(history).getByRole('button', { name: /cerrar/i }));

    await user.click(screen.getByRole('button', { name: /^Hay 1 número\(s\) repetido\(s\)/ }));
    const dialog = screen.getByRole('dialog', { name: 'Números repetidos' });
    const row = within(dialog).getByText('Ana Pérez, Luis Pérez').closest('tr')!;
    expect(within(row).getByText('2')).toBeInTheDocument();
  });

  it('sends an approved template through the WhatsApp API to the selected clients', async () => {
    api.templates.mockResolvedValue([promo]);
    api.createCampaign.mockResolvedValue({ campaign_id: 7, encolados: 2, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await screen.findByText('Ana Pérez');
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));

    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_octubre|es');
    // {{1}} = name, {{2}} = brand of the phone by default; previewed with the first client.
    expect(screen.getByText('Hola Ana, oferta para tu Samsung.')).toBeInTheDocument();
    expect(screen.getByText('2 destinatario(s) · costo aprox. $0.15')).toBeInTheDocument();

    // Test numbers typed by hand: invalid ones are rejected, valid ones can be removed again.
    const numberInput = screen.getByLabelText('Números de prueba');
    await user.type(numberInput, '123{Enter}');
    expect(screen.getByRole('alert')).toHaveTextContent('no es un celular válido');
    await user.clear(numberInput);
    await user.type(numberInput, '0987654321');
    await user.click(screen.getByRole('button', { name: 'Agregar' }));
    await user.type(numberInput, '0981111111{Enter}');
    await user.click(screen.getByRole('button', { name: 'Quitar 0981111111' }));
    expect(screen.getByText('3 destinatario(s) · costo aprox. $0.22')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));

    expect(api.createCampaign).toHaveBeenCalledWith(
      {
        plantilla: 'promo_octubre',
        idioma: 'es',
        cliente_ids: [1, 2],
        numeros: ['0987654321'],
        parametros: [{ source: 'NOMBRE' }, { source: 'MARCA' }],
      },
      null,
    );
    expect(await screen.findByText('Enviando 2 mensaje(s).')).toBeInTheDocument();
  });

  it('sends the image of step 1 as the header of a template with an image', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:micas', revokeObjectURL: () => undefined }));
    api.templates.mockResolvedValue([{ ...promo, name: 'promo_img', header_format: 'IMAGE' }]);
    api.createCampaign.mockResolvedValue({ campaign_id: 8, encolados: 1, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Incluir a Ana Pérez' }));

    const image = new File(['png'], 'micas.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('image-input'), image);
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_img|es');
    expect(screen.getByText(/Se usará "micas.png" del paso 1/)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Imagen del encabezado' })).toHaveAttribute('src', 'blob:micas');

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));
    expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'promo_img' }), image);
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
