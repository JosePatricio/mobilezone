const MONTHS = [
  'Enero',
  'Febrero',
  'Marzo',
  'Abril',
  'Mayo',
  'Junio',
  'Julio',
  'Agosto',
  'Septiembre',
  'Octubre',
  'Noviembre',
  'Diciembre',
];

const pad = (n: number) => String(n).padStart(2, '0');
/** "1 Octubre 2026" */
const dateText = (d: Date) => `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

/** Parses "YYYY-MM-DD" as a local date (avoids timezone shifts). */
function parse(value: string): Date {
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (dateOnly) return new Date(Number(dateOnly[1]), Number(dateOnly[2]) - 1, Number(dateOnly[3]));
  return new Date(value);
}

export function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  return Number.isNaN(date.getTime()) ? '—' : dateText(date);
}

/** "1 Octubre 2026, 16:20" (local time). */
export function formatDateTime(value: string | null | undefined): string {
  if (!value) return '—';
  const date = parse(value);
  return Number.isNaN(date.getTime()) ? '—' : `${dateText(date)}, ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
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
