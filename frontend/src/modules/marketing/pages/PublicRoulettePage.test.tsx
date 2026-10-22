import { screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Route, Routes } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { PublicRoulette } from '../types';
import { PublicRoulettePage } from './PublicRoulettePage';

const api = vi.hoisted(() => ({ get: vi.fn(), play: vi.fn() }));
vi.mock('../services/marketingApi', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../services/marketingApi')>()),
  publicRouletteApi: api,
}));

const wheel: PublicRoulette = {
  nombre: 'Ruleta octubre',
  fecha_inicio: '2026-10-01',
  fecha_fin: '2026-10-31',
  items: [
    { id: 1, nombre: 'Mica gratis', premio: true, imagen_url: null },
    { id: 2, nombre: 'Sigue intentando', premio: false, imagen_url: null },
  ],
  estado: 'DISPONIBLE',
  resultado: null,
  gano: false,
};

const open = () =>
  renderWithProviders(
    <Routes>
      <Route path="/ruleta/:token" element={<PublicRoulettePage />} />
    </Routes>,
    { route: '/ruleta/tok123' },
  );

beforeEach(() => {
  vi.clearAllMocks();
  // Without animation the result shows at once.
  vi.stubGlobal('matchMedia', () => ({ matches: true }));
});

describe('PublicRoulettePage', () => {
  it('spins once and shows the prize', async () => {
    api.get.mockResolvedValue(wheel);
    api.play.mockResolvedValue({ ...wheel, estado: 'JUGADO', resultado: 0, gano: true });
    const user = userEvent.setup();
    open();

    expect(await screen.findByRole('heading', { name: 'Ruleta octubre' })).toBeInTheDocument();
    expect(api.get).toHaveBeenCalledWith('tok123');
    await user.click(screen.getByRole('button', { name: '¡Girar la ruleta!' }));
    expect(api.play).toHaveBeenCalledWith('tok123');
    expect(await screen.findByText(/¡Felicidades! Ganaste/)).toHaveTextContent('¡Felicidades! Ganaste: Mica gratis');
    expect(screen.queryByRole('button', { name: '¡Girar la ruleta!' })).not.toBeInTheDocument();
  });

  it('a link already used shows what was won and cannot spin again', async () => {
    api.get.mockResolvedValue({ ...wheel, estado: 'JUGADO', resultado: 1, gano: false });
    open();
    const outcome = (await screen.findByText('Este enlace ya se usó.')).closest('[role="status"]');
    expect(outcome).toHaveTextContent('Sigue intentando');
    expect(outcome).toHaveTextContent('Este enlace ya se usó.');
    expect(screen.queryByRole('button', { name: '¡Girar la ruleta!' })).not.toBeInTheDocument();
  });

  it('outside its dates the wheel cannot be played', async () => {
    api.get.mockResolvedValue({ ...wheel, estado: 'VENCIDA' });
    open();
    expect(await screen.findByText('Esta ruleta ya no está vigente.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: '¡Girar la ruleta!' })).not.toBeInTheDocument();
  });

  it('an unknown link', async () => {
    api.get.mockRejectedValue({ isAxiosError: true, response: { status: 404, data: {} } });
    open();
    expect(await screen.findByText('Enlace no válido')).toBeInTheDocument();
  });
});
