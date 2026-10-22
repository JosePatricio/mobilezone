import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import { todayIso } from '@/shared/utils/format';
import type { Roulette, RouletteDetail } from '../types';
import { RoulettePage, validity } from './RoulettePage';

const api = vi.hoisted(() => ({
  roulettes: vi.fn(),
  roulette: vi.fn(),
  createRoulette: vi.fn(),
  deleteRoulette: vi.fn(),
}));
vi.mock('../services/marketingApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/marketingApi')>()),
  marketingApi: api,
}));

const roulette: Roulette = {
  id: 1,
  nombre: 'Ruleta octubre',
  fecha_inicio: '2026-10-01',
  fecha_fin: '2999-12-31',
  created_at: '2026-10-01T10:00:00Z',
  creado_por: 'Admin Sistema',
  items: 3,
  enlaces: 2,
  abiertos: 2,
  jugados: 1,
  ganadores: 1,
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: () => 'blob:mica', revokeObjectURL: () => undefined }));
  api.roulettes.mockResolvedValue([]);
});

describe('RoulettePage (Propaganda › Ruleta)', () => {
  it('creates a wheel with N options, their images and the preview', async () => {
    api.createRoulette.mockResolvedValue(roulette);
    const user = userEvent.setup();
    renderWithProviders(<RoulettePage />);
    expect(await screen.findByText('Sin ruletas')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Crear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear ruleta' });
    expect(within(dialog).getByLabelText(/Fecha inicio/)).toHaveValue(todayIso()); // today by default

    await user.type(within(dialog).getByRole('textbox', { name: /^Nombre( \*)?$/ }), 'Ruleta octubre');
    await user.type(within(dialog).getByLabelText(/Fecha fin/), '2026-12-31');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre de la opción 1' }), 'Mica gratis');
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre de la opción 2' }), '10% desc.');
    await user.click(within(dialog).getByRole('button', { name: '+ Agregar opción' }));
    await user.type(within(dialog).getByRole('textbox', { name: 'Nombre de la opción 3' }), 'Sigue intentando');
    const premios = within(dialog).getAllByRole('checkbox', { name: 'Premio' });
    await user.click(premios[2]);
    const image = new File(['png'], 'mica.png', { type: 'image/png' });
    await user.upload(within(dialog).getByLabelText('Imagen de la opción 1', { selector: 'input' }), image);

    // Preview: one slice per option, with its text and image.
    const preview = within(dialog).getByRole('img', { name: /Vista previa: Mica gratis, 10% desc., Sigue intentando/ });
    expect(preview.querySelectorAll('path')).toHaveLength(4); // 3 slices + pointer
    expect(preview.querySelector('image')).toHaveAttribute('href', 'blob:mica');

    await user.click(within(dialog).getAllByRole('button', { name: 'Crear' })[0]);
    expect(api.createRoulette).toHaveBeenCalledWith(
      { nombre: 'Ruleta octubre', fecha_inicio: todayIso(), fecha_fin: '2026-12-31' },
      [
        expect.objectContaining({ nombre: 'Mica gratis', premio: true, file: image }),
        expect.objectContaining({ nombre: '10% desc.', premio: true, file: null }),
        expect.objectContaining({ nombre: 'Sigue intentando', premio: false, file: null }),
      ],
    );
    expect(await screen.findByText('Ruleta creada.')).toBeInTheDocument();
  }, 20_000); // types a lot: slow when the whole suite runs at once

  it('validates the form before sending it', async () => {
    const user = userEvent.setup();
    renderWithProviders(<RoulettePage />);
    await user.click(await screen.findByRole('button', { name: 'Crear' }));
    const dialog = await screen.findByRole('dialog', { name: 'Crear ruleta' });
    const create = within(dialog).getAllByRole('button', { name: 'Crear' })[0];

    await user.click(create);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Escriba el nombre de la ruleta');
    await user.type(within(dialog).getByRole('textbox', { name: /^Nombre( \*)?$/ }), 'R');
    await user.type(within(dialog).getByLabelText(/Fecha fin/), '2020-01-01');
    await user.click(create);
    expect(within(dialog).getByRole('alert')).toHaveTextContent('anterior a la fecha de inicio');
    expect(within(dialog).getByRole('button', { name: 'Quitar la opción 1' })).toBeDisabled(); // at least 2
    expect(api.createRoulette).not.toHaveBeenCalled();
  });

  it('shows who opened, played and won each link', async () => {
    const detail: RouletteDetail = {
      roulette,
      items: [
        { id: 1, nombre: 'Mica gratis', premio: true, imagen_url: '/media/roulettes/1.png' },
        { id: 2, nombre: '10% desc.', premio: true, imagen_url: null },
        { id: 3, nombre: 'Sigue intentando', premio: false, imagen_url: null },
      ],
      links: [
        {
          id: 2, cliente_id: 8, cliente: 'Ana Pérez', telefono: '593991111111', campaign_id: 1,
          created_at: '2026-10-02T10:00:00Z', abierto_at: '2026-10-02T11:00:00Z', jugado_at: '2026-10-02T11:01:00Z',
          resultado: 'Mica gratis', gano: true,
        },
        {
          id: 1, cliente_id: 9, cliente: 'Luis Pérez', telefono: '593992222222', campaign_id: 1,
          created_at: '2026-10-02T10:00:00Z', abierto_at: '2026-10-03T09:00:00Z', jugado_at: null,
          resultado: null, gano: false,
        },
      ],
    };
    api.roulettes.mockResolvedValue([roulette]);
    api.roulette.mockResolvedValue(detail);
    const user = userEvent.setup();
    renderWithProviders(<RoulettePage />);

    const row = (await screen.findByText('Ruleta octubre')).closest('tr')!;
    expect(within(row).getByText('Vigente')).toBeInTheDocument();
    // Already sent: it cannot be deleted.
    expect(within(row).queryByRole('button', { name: /Eliminar/ })).not.toBeInTheDocument();
    await user.click(within(row).getByRole('button', { name: 'Ver' }));

    const dialog = await screen.findByRole('dialog', { name: 'Ruleta Ruleta octubre' });
    expect(within(dialog).getByText('Ganó: Mica gratis')).toBeInTheDocument();
    const luis = within(dialog).getByText('Luis Pérez').closest('tr')!;
    expect(within(luis).getAllByText('—')).toHaveLength(2); // opened, not played yet
    expect(within(dialog).getByText('2 enviados · 2 abiertos · 1 jugados · 1 ganadores')).toBeInTheDocument();
  });

  it('labels the validity of each wheel', () => {
    expect(validity({ fecha_inicio: '2026-10-01', fecha_fin: '2026-10-31' }, '2026-10-22').label).toBe('Vigente');
    expect(validity({ fecha_inicio: '2026-11-01', fecha_fin: '2026-11-30' }, '2026-10-22').label).toBe('Programada');
    expect(validity({ fecha_inicio: '2026-09-01', fecha_fin: '2026-09-30' }, '2026-10-22').label).toBe('Vencida');
  });
});
