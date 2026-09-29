import type { ReactNode } from 'react';
import { getErrorMessage } from '@/shared/services/apiError';
import { Button } from './Button';

export function Loading({ label = 'Cargando…' }: { label?: string }) {
  return (
    <div className="state state-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({ title = 'Sin resultados', children }: { title?: string; children?: ReactNode }) {
  return (
    <div className="state state-empty">
      <p className="state-title">{title}</p>
      {children && <div className="muted">{children}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  return (
    <div className="state state-error" role="alert">
      <p className="state-title">No se pudo cargar la información</p>
      <p className="muted">{getErrorMessage(error)}</p>
      {onRetry && (
        <Button variant="secondary" size="sm" onClick={onRetry}>
          Reintentar
        </Button>
      )}
    </div>
  );
}

type Tone = 'success' | 'neutral' | 'warning' | 'danger' | 'info';

export function StatusBadge({
  active,
  label,
  tone,
}: {
  active?: boolean;
  label?: string;
  tone?: Tone;
}) {
  const resolvedTone: Tone = tone ?? (active ? 'success' : 'neutral');
  const text = label ?? (active ? 'Activo' : 'Inactivo');
  return <span className={`badge badge-${resolvedTone}`}>{text}</span>;
}

export function PageHeader({ title, actions, children }: { title: string; actions?: ReactNode; children?: ReactNode }) {
  return (
    <div className="page-header">
      <div>
        <h1>{title}</h1>
        {children && <div className="muted">{children}</div>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children }: { title?: string; actions?: ReactNode; children: ReactNode }) {
  return (
    <section className="card">
      {(title || actions) && (
        <header className="card-header">
          {title && <h2>{title}</h2>}
          {actions}
        </header>
      )}
      <div className="card-body">{children}</div>
    </section>
  );
}
