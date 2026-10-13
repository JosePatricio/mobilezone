import { useEffect, useState } from 'react';
import { formatDateTime } from '@/shared/utils/format';

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** "2 días, 2 horas y 15 minutos" (zero parts are left out). */
export function formatDuration(ms: number): string {
  const total = Math.floor(Math.abs(ms) / MINUTE);
  if (total === 0) return 'menos de 1 minuto';
  const days = Math.floor(total / (DAY / MINUTE));
  const hours = Math.floor((total % (DAY / MINUTE)) / 60);
  const minutes = total % 60;
  const parts = [
    days && plural(days, 'día', 'días'),
    hours && plural(hours, 'hora', 'horas'),
    minutes && plural(minutes, 'minuto', 'minutos'),
  ].filter(Boolean) as string[];
  return parts.length === 1 ? parts[0] : `${parts.slice(0, -1).join(', ')} y ${parts[parts.length - 1]}`;
}

/** Remaining time until the delivery: "Tienes 5 horas" / "Atrasada 2 horas y 15 minutos". */
export function deliveryCountdown(fechaEntrega: string, now: number): { text: string; overdue: boolean } {
  const remaining = new Date(fechaEntrega).getTime() - now;
  const overdue = remaining < 0;
  return { text: `${overdue ? 'Atrasada' : 'Tienes'} ${formatDuration(remaining)}`, overdue };
}

/** Current time, refreshed every second (the countdown runs in real time). */
function useNow(intervalMs = 1000): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs]);
  return now;
}

/** Entrega column: live countdown to the delivery date and, below, the date itself. */
export function DeliveryCountdown({ fechaEntrega, finalized }: { fechaEntrega: string | null; finalized: boolean }) {
  if (!fechaEntrega) return <>—</>;
  // A finalized order was already delivered: only the date.
  if (finalized) return <>{formatDateTime(fechaEntrega)}</>;
  return <LiveCountdown fechaEntrega={fechaEntrega} />;
}

function LiveCountdown({ fechaEntrega }: { fechaEntrega: string }) {
  const now = useNow();
  const { text, overdue } = deliveryCountdown(fechaEntrega, now);
  return (
    <>
      <span className={overdue ? 'text-danger' : undefined} role="timer">
        {text}
      </span>
      <small className="muted d-block">{formatDateTime(fechaEntrega)}</small>
    </>
  );
}
