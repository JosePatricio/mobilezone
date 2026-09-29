const dateFormatter = new Intl.DateTimeFormat('es', { day: '2-digit', month: '2-digit', year: 'numeric' });
const dateTimeFormatter = new Intl.DateTimeFormat('es', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

/** Parses "YYYY-MM-DD" as a local date (avoids timezone shifts). */
function parse(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  return Number.isNaN(date.getTime()) ? '—' : dateFormatter.format(date);
}

export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  return Number.isNaN(date.getTime()) ? '—' : dateTimeFormatter.format(date);
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function formatOrderNumber(num: number | null | undefined): string {
  return num == null ? '—' : String(num).padStart(6, '0');
}

export function fullName(user: { nombre: string; apellido: string } | null | undefined): string {
  return user ? `${user.nombre} ${user.apellido}` : '—';
}

/** Removes empty values so they are not sent as query params. */
export function cleanParams<T extends Record<string, unknown>>(params: T): Partial<T> {
  return Object.fromEntries(
    Object.entries(params).filter(([, v]) => v !== '' && v !== undefined && v !== null),
  ) as Partial<T>;
}
