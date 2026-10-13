import { act, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { DeliveryCountdown, deliveryCountdown, formatDuration } from './DeliveryCountdown';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

describe('formatDuration', () => {
  it('lists days, hours and minutes, leaving out the zero parts', () => {
    expect(formatDuration(5 * HOUR)).toBe('5 horas');
    expect(formatDuration(2 * DAY + 2 * HOUR + 15 * MINUTE)).toBe('2 días, 2 horas y 15 minutos');
    expect(formatDuration(DAY + MINUTE)).toBe('1 día y 1 minuto');
    expect(formatDuration(HOUR + 59_999)).toBe('1 hora');
    expect(formatDuration(30_000)).toBe('menos de 1 minuto');
  });
});

describe('deliveryCountdown', () => {
  it('shows the remaining time, or the delay once the delivery date has passed', () => {
    const now = new Date(2026, 9, 13, 10, 0).getTime();
    expect(deliveryCountdown(new Date(now + 5 * HOUR).toISOString(), now)).toEqual({ text: 'Tienes 5 horas', overdue: false });
    expect(deliveryCountdown(new Date(now - 90 * MINUTE).toISOString(), now)).toEqual({
      text: 'Atrasada 1 hora y 30 minutos',
      overdue: true,
    });
  });
});

describe('DeliveryCountdown', () => {
  afterEach(() => vi.useRealTimers());

  it('counts down in real time and shows the delivery date below', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 10, 0, 0));
    render(<DeliveryCountdown fechaEntrega={new Date(2026, 9, 13, 12, 0).toISOString()} finalized={false} />);
    expect(screen.getByRole('timer')).toHaveTextContent('Tienes 2 horas');
    expect(screen.getByText(/12:00/)).toBeInTheDocument();
    act(() => vi.advanceTimersByTime(MINUTE));
    expect(screen.getByRole('timer')).toHaveTextContent('Tienes 1 hora y 59 minutos');
  });

  it('a finalized order shows only the date, and no date shows a dash', () => {
    const { rerender } = render(<DeliveryCountdown fechaEntrega="2026-10-13T17:00:00Z" finalized />);
    expect(screen.queryByRole('timer')).not.toBeInTheDocument();
    rerender(<DeliveryCountdown fechaEntrega={null} finalized={false} />);
    expect(screen.getByText('—')).toBeInTheDocument();
  });
});
