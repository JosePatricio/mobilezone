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

/** ISO date-time → value of an <input type="datetime-local"> ("2026-10-05T16:30", local time). */
export function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Value of an <input type="datetime-local"> (local time) → ISO 8601 in UTC; "" → null. */
export function fromDateTimeLocal(value: string | null | undefined): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** "30 días", "1 día", "Sin garantía". */
export function formatWarrantyDays(days: number | null | undefined): string {
  if (!days) return 'Sin garantía';
  return `${days} ${days === 1 ? 'día' : 'días'}`;
}
