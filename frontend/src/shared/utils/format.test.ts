import { formatDate, formatDateTime } from './format';

describe('date format', () => {
  it('formats date and time as "1 Octubre 2026, 16:20" (local time)', () => {
    expect(formatDateTime(new Date(2026, 9, 1, 16, 20).toISOString())).toBe('1 Octubre 2026, 16:20');
    expect(formatDateTime(new Date(2026, 0, 5, 9, 3).toISOString())).toBe('5 Enero 2026, 09:03');
  });

  it('formats dates without shifting the day', () => {
    expect(formatDate('2026-12-31')).toBe('31 Diciembre 2026');
    expect(formatDate(null)).toBe('—');
  });
});
