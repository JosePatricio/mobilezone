import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { DashboardCharts as Charts, PeriodStats } from '../services/dashboardApi';
import { ColumnChart, niceTicks } from './ColumnChart';
import { DashboardCharts } from './DashboardCharts';

const api = vi.hoisted(() => ({ charts: vi.fn() }));
vi.mock('../services/dashboardApi', () => ({ DASHBOARD_KEY: 'dashboard', dashboardApi: api }));

const period = (inicio: string, etiqueta: string, ventas: number | null, monto: string | null, ordenes: number | null): PeriodStats => ({
  inicio,
  etiqueta,
  ventas,
  monto,
  ordenes,
});

const days: Charts = {
  agrupacion: 'dia',
  periodos: [period('2026-10-07', '07/10', 2, '40.00', 1), period('2026-10-08', '08/10', 3, '120.50', 4)],
};

beforeEach(() => {
  vi.clearAllMocks();
  api.charts.mockImplementation((agrupacion: string) =>
    Promise.resolve(
      agrupacion === 'mes'
        ? { agrupacion: 'mes', periodos: [period('2026-09-01', 'Sep 2026', 10, '900.00', 8), period('2026-10-01', 'Oct 2026', 5, '300.00', 9)] }
        : days,
    ),
  );
});

describe('niceTicks', () => {
  it('rounds the axis to clean steps', () => {
    expect(niceTicks(120.5)).toEqual([0, 50, 100, 150]);
    expect(niceTicks(4)).toEqual([0, 1, 2, 3, 4]);
    expect(niceTicks(0)).toEqual([0, 1]);
    // Counts never get fractional (or repeated) ticks.
    expect(niceTicks(2, 4, true)).toEqual([0, 1, 2]);
    expect(niceTicks(9, 4, true)).toEqual([0, 5, 10]);
  });
});

describe('ColumnChart', () => {
  it('draws one column per period and shows the tooltip on focus', () => {
    const { container } = render(
      <ColumnChart
        ariaLabel="Órdenes"
        color="blue"
        format={String}
        data={[
          { key: 'a', label: '07/10', value: 1 },
          { key: 'b', label: '08/10', value: 4, detail: ['4 órdenes'] },
        ]}
      />,
    );
    expect(container.querySelectorAll('.chart-bar')).toHaveLength(2);
    expect(screen.getByRole('img', { name: 'Órdenes' })).toBeInTheDocument();
    fireEvent.focus(screen.getByLabelText('08/10: 4, 4 órdenes'));
    expect(screen.getByRole('status')).toHaveTextContent('4');
    expect(screen.getByRole('status')).toHaveTextContent('4 órdenes');
  });
});

describe('DashboardCharts', () => {
  it('shows the current period with its change and switches the grouping', async () => {
    renderWithProviders(<DashboardCharts />);
    expect(await screen.findByText('Hoy · cobrado')).toBeInTheDocument();
    expect(screen.getByText('Ventas (total cobrado)')).toBeInTheDocument();
    expect(screen.getByText('Órdenes de trabajo recibidas')).toBeInTheDocument();
    expect(screen.getByText(/201 % vs ayer/)).toBeInTheDocument(); // 40 -> 120.50
    expect(api.charts).toHaveBeenCalledWith('dia');

    await userEvent.click(screen.getByRole('radio', { name: 'Mes' }));
    expect(await screen.findByText('Este mes · cobrado')).toBeInTheDocument();
    expect(api.charts).toHaveBeenCalledWith('mes');
    expect(screen.getByText(/67 % vs el mes anterior/)).toBeInTheDocument(); // 900 -> 300
  });

  it('hides the sales without permission (null in the API)', async () => {
    api.charts.mockResolvedValue({
      agrupacion: 'dia',
      periodos: [period('2026-10-07', '07/10', null, null, 1), period('2026-10-08', '08/10', null, null, 2)],
    });
    renderWithProviders(<DashboardCharts />);
    expect(await screen.findByText('Hoy · órdenes recibidas')).toBeInTheDocument();
    expect(screen.queryByText('Ventas (total cobrado)')).not.toBeInTheDocument();
  });
});
