import { fireEvent, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { Campaign, OrderClient, WhatsAppTemplate } from '../types';
import { MarketingPage } from './MarketingPage';

const api = vi.hoisted(() => ({
  recipients: vi.fn(),
  templates: vi.fn(),
  campaigns: vi.fn(),
  campaign: vi.fn(),
  createCampaign: vi.fn(),
  roulettes: vi.fn(),
}));
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

describe('MarketingPage (Propaganda › Campaña)', () => {
  it('opens with "Enviar propaganda" and goes back to the list', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);

    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));

    expect(screen.getByRole('group', { name: 'Agregar imagen o video' })).toBeInTheDocument();
    expect(await screen.findByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Incluir a Eva Pérez' })).toBeDisabled(); // no celular
    // Starts with the text of the promo template.
    expect(screen.getByRole('textbox', { name: 'Mensaje' })).toHaveTextContent(
      '¡Hola @NOMBRE! 📱 llegaron MICAS con DISEÑO para tu @TELEFONO',
    );
    expect(screen.queryByRole('button', { name: 'Preparar mensajes' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '← Volver' }));
    expect(screen.getByRole('button', { name: 'Enviar propaganda' })).toBeInTheDocument();
    expect(screen.queryByText('Luis Pérez')).not.toBeInTheDocument();
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
    // No test inputs: every placeholder takes the data of each client.
    expect(screen.queryByLabelText('@nombre')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('@telefono')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    const confirmation = await screen.findByRole('alertdialog');
    expect(confirmation).toHaveTextContent('a 2 cliente(s)');
    expect(confirmation).toHaveTextContent('Costo aproximado: $0.15');
    await user.click(within(confirmation).getByRole('button', { name: 'Enviar' }));

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

  it('sends the image of step 1 as the header of a template with an image', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:micas', revokeObjectURL: () => undefined }));
    api.templates.mockResolvedValue([{ ...promo, name: 'promo_img', header_format: 'IMAGE' }]);
    api.createCampaign.mockResolvedValue({ campaign_id: 8, encolados: 1, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Incluir a Ana Pérez' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_img|es');
    expect(screen.queryByLabelText(/Imagen del encabezado/)).not.toBeInTheDocument(); // no file input of its own

    // Without the image of step 1 it cannot be sent.
    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La plantilla lleva una imagen');

    const image = new File(['png'], 'micas.png', { type: 'image/png' });
    await user.upload(screen.getByTestId('media-input'), image);
    expect(screen.getByRole('img', { name: 'Imagen del encabezado' })).toHaveAttribute('src', 'blob:micas');

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));
    expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'promo_img' }), image);
  });

  it('sends the video of step 1 as the header of a template with a video', async () => {
    vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:promo', revokeObjectURL: () => undefined }));
    api.templates.mockResolvedValue([
      { ...promo, name: 'promo_img', header_format: 'IMAGE' },
      { ...promo, name: 'promo_video', header_format: 'VIDEO' },
    ]);
    api.createCampaign.mockResolvedValue({ campaign_id: 9, encolados: 1, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Incluir a Ana Pérez' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_video|es');

    // An image does not fill the header of a video template.
    await user.upload(screen.getByTestId('media-input'), new File(['png'], 'micas.png', { type: 'image/png' }));
    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('La plantilla lleva un video');

    const video = new File(['mp4'], 'promo.mp4', { type: 'video/mp4' });
    await user.upload(screen.getByTestId('media-input'), video);
    expect(screen.getByLabelText('Video del encabezado')).toHaveAttribute('src', 'blob:promo');

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));
    expect(api.createCampaign).toHaveBeenCalledWith(expect.objectContaining({ plantilla: 'promo_video' }), video);
  });

  it('"¿Incluir ruleta?" adds @RULETA to "2. Texto": its place is the placeholder of the link', async () => {
    api.templates.mockResolvedValue([
      { ...promo, body: 'Hola {{1}}, oferta para tu {{2}}. Gira la ruleta: {{3}}', body_params: ['1', '2', '3'] },
      { ...promo, name: 'promo_corta' },
    ]);
    api.roulettes.mockResolvedValue([
      { id: 4, nombre: 'Ruleta octubre', fecha_inicio: '2026-01-01', fecha_fin: '2999-12-31' },
      { id: 5, nombre: 'Vencida', fecha_inicio: '2020-01-01', fecha_fin: '2020-01-31' },
    ]);
    api.createCampaign.mockResolvedValue({ campaign_id: 3, encolados: 1, sin_numero: 0, dados_de_baja: 0 });
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Incluir a Ana Pérez' }));
    const plantilla = await screen.findByRole('combobox', { name: 'Plantilla' });
    await user.selectOptions(plantilla, 'promo_octubre|es');
    const text = screen.getByRole('textbox', { name: 'Mensaje' });
    const toolbar = screen.getByRole('toolbar', { name: 'Formato del texto' });

    const include = screen.getByRole('checkbox', { name: /¿Incluir ruleta\?/ });
    expect(include).not.toBeChecked(); // off by default
    expect(within(toolbar).queryByRole('button', { name: '@RULETA' })).not.toBeInTheDocument();
    expect(api.roulettes).not.toHaveBeenCalled();
    await user.click(include);
    expect(within(toolbar).getByRole('button', { name: '@RULETA' })).toBeInTheDocument();
    expect(text).toHaveTextContent(/STOP para no recibir más mensajes\s*@RULETA$/);
    expect(screen.queryByRole('combobox', { name: 'Variable del enlace' })).not.toBeInTheDocument();
    const select = await screen.findByRole('combobox', { name: 'Ruleta' });
    await screen.findByRole('option', { name: 'Ruleta octubre' });
    expect(screen.queryByRole('option', { name: 'Vencida' })).not.toBeInTheDocument(); // only the valid ones

    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Elija la ruleta');
    await user.selectOptions(select, '4');
    // @NOMBRE {{1}}, @TELEFONO {{2}}, @RULETA {{3}}: the preview shows the text with the link of the client…
    expect(screen.getByLabelText('Vista previa de la plantilla')).toHaveTextContent(
      `¡Hola Ana! 📱 llegaron MICAS con DISEÑO para tu Samsung`,
    );
    expect(screen.getByLabelText('Vista previa de la plantilla')).toHaveTextContent(
      `no recibir más mensajes${window.location.origin}/ruleta/…`,
    );
    // …and, as it is not the text of the template, what WhatsApp will really send.
    expect(screen.getByRole('note')).toHaveTextContent(`Gira la ruleta: ${window.location.origin}/ruleta/…`);

    // A template without a placeholder for the link cannot carry it.
    await user.selectOptions(plantilla, 'promo_corta|es');
    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    expect(screen.getByRole('alert')).toHaveTextContent('@RULETA es la variable 3 del texto y la plantilla tiene 2');

    await user.selectOptions(plantilla, 'promo_octubre|es');
    await user.click(screen.getByRole('button', { name: 'Enviar por WhatsApp' }));
    await user.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Enviar' }));
    expect(api.createCampaign).toHaveBeenCalledWith(
      expect.objectContaining({
        parametros: [{ source: 'NOMBRE' }, { source: 'MARCA' }, { source: 'RULETA' }],
        ruleta_id: 4,
        enlace_base: window.location.origin,
      }),
      null,
    );

    // Unchecking takes @RULETA out of the text again.
    await user.click(include);
    expect(text).not.toHaveTextContent('@RULETA');
    expect(within(toolbar).queryByRole('button', { name: '@RULETA' })).not.toBeInTheDocument();
  });

  it('the preview follows the text of "2. Texto" while it is edited', async () => {
    const body =
      '¡Hola {{1}}! 📱 llegaron MICAS con DISEÑO para tu {{2}}, reservalo antes que se agoten.\n' +
      'Responde STOP para no recibir más mensajes';
    api.templates.mockResolvedValue([{ ...promo, body }]);
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Incluir a Ana Pérez' }));
    await user.selectOptions(await screen.findByRole('combobox', { name: 'Plantilla' }), 'promo_octubre|es');

    const preview = screen.getByLabelText('Vista previa de la plantilla');
    expect(preview).toHaveTextContent('¡Hola Ana! 📱 llegaron MICAS con DISEÑO para tu Samsung');
    expect(screen.queryByRole('note')).not.toBeInTheDocument(); // same text as the template

    const text = screen.getByRole('textbox', { name: 'Mensaje' });
    // What the browser does while typing at the end of the text (jsdom has no real editing).
    text.append(document.createTextNode(' ¡Solo hoy @NOMBRE!'));
    fireEvent.input(text);
    expect(preview).toHaveTextContent('¡Solo hoy Ana!');
    expect(screen.getByRole('note')).toHaveTextContent('WhatsApp solo envía el texto aprobado por Meta');
  });

  it('filters the clients by the brand of the phone', async () => {
    const user = userEvent.setup();
    renderWithProviders(<MarketingPage />);
    await user.click(screen.getByRole('button', { name: 'Enviar propaganda' }));
    await screen.findByText('Ana Pérez');
    await user.click(screen.getByRole('checkbox', { name: 'Seleccionar todos' }));

    await user.selectOptions(screen.getByRole('combobox', { name: 'Marca del teléfono' }), 'Xiaomi');
    expect(screen.queryByText('Ana Pérez')).not.toBeInTheDocument();
    expect(screen.getByText('Luis Pérez')).toBeInTheDocument();
    expect(screen.getByText('1 de 3 número(s) seleccionado(s)')).toBeInTheDocument();
  });

  it('lists the WhatsApp campaigns under "Enviar propaganda"', async () => {
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

    expect(screen.getByRole('heading', { name: 'Campaña' })).toBeInTheDocument();
    const row = (await screen.findByText('Admin Sistema')).closest('tr')!;
    // total, pendientes, entregados (delivered + read), leídos, fallidos
    expect([...row.querySelectorAll('td.text-right')].slice(0, 5).map((td) => td.textContent)).toEqual([
      '3',
      '0',
      '2',
      '1',
      '1',
    ]);

    // "Ver": the promotion as the first client received it, then the state of each message.
    api.campaign.mockResolvedValue({
      campaign: {
        ...campaign,
        cuerpo: '¡Hola {{1}}! llegaron MICAS para tu {{2}}',
        encabezado: null,
        pie: 'Responde STOP',
        imagen_url: '/media/campaigns/micas.jpg',
      },
      messages: [
        {
          id: 1,
          cliente_id: 1,
          cliente: 'Ana Pérez',
          telefono: '593991111111',
          estado: 'LEIDO',
          error: null,
          updated_at: '2026-10-14T15:01:00Z',
          parametros: [
            ['1', 'Ana'],
            ['2', 'Samsung'],
          ],
        },
      ],
    });
    await userEvent.setup().click(within(row).getByRole('button', { name: 'Ver' }));
    const preview = await screen.findByLabelText('Vista previa de la propaganda');
    expect(within(preview).getByText('¡Hola Ana! llegaron MICAS para tu Samsung')).toBeInTheDocument();
    expect(within(preview).getByText('Responde STOP')).toBeInTheDocument();
    expect(within(preview).getByRole('img', { name: 'Imagen de la propaganda' })).toHaveAttribute(
      'src',
      '/media/campaigns/micas.jpg',
    );
    expect(screen.getByText('Así lo recibió Ana Pérez')).toBeInTheDocument();
  });
});
