import { useQuery } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { DASHBOARD_KEY, dashboardApi } from '@/modules/dashboard/services/dashboardApi';
import { deliveryCountdown } from '@/modules/work-orders/components/DeliveryCountdown';
import { BellIcon } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { fullName } from '@/shared/utils/format';

const REFRESH = 60_000;

/**
 * Notifications bell of the header: work orders not finalized whose delivery time already passed
 * (atrasadas) or comes within the next day (a punto de atrasarse), and products below their
 * "Mínimo recomendado" (the same data as the dashboard alert).
 * Each kind is only checked with its permission; the badge is the total of all.
 */
export function NotificationBell() {
  const { hasPermission } = useAuth();
  const canOrders = hasPermission(P.WORK_ORDERS_VIEW);
  const canProducts = hasPermission(P.PRODUCTS_VIEW);
  const id = useId();
  const location = useLocation();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);

  const orders = useQuery({
    queryKey: [DASHBOARD_KEY, 'overdue-orders'],
    queryFn: dashboardApi.overdueOrders,
    refetchInterval: REFRESH,
    enabled: canOrders,
  });
  const soonOrders = useQuery({
    queryKey: [DASHBOARD_KEY, 'due-soon-orders'],
    queryFn: dashboardApi.dueSoonOrders,
    refetchInterval: REFRESH,
    enabled: canOrders,
  });
  const products = useQuery({
    queryKey: [DASHBOARD_KEY, 'low-stock'],
    queryFn: dashboardApi.lowStock,
    refetchInterval: REFRESH,
    enabled: canProducts,
  });

  useEffect(() => setOpen(false), [location.pathname]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (!canOrders && !canProducts) return null;

  const overdue = orders.data ?? [];
  const dueSoon = soonOrders.data ?? [];
  const lowStock = products.data ?? [];
  const count = overdue.length + dueSoon.length + lowStock.length;
  const now = Date.now();

  return (
    <div className="notif" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        className="icon-btn notif-bell"
        aria-label={count ? `Notificaciones (${count})` : 'Notificaciones'}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => setOpen((v) => !v)}
      >
        <BellIcon width={20} height={20} />
        {count > 0 && (
          <span className="notif-badge" aria-hidden>
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>
      {open && (
        <div id={`${id}-panel`} role="dialog" aria-label="Notificaciones" className="notif-panel">
          {count === 0 && <p className="notif-empty muted">No hay notificaciones</p>}
          {overdue.length > 0 && (
            <section aria-label="Órdenes atrasadas">
              <header className="notif-section">
                <strong>Órdenes atrasadas ({overdue.length})</strong>
                <Link to="/work-orders">Ver órdenes</Link>
              </header>
              <ul className="notif-list">
                {overdue.map((o) => (
                  <li key={o.id}>
                    <Link to={`/work-orders/${o.id}`} className="notif-item">
                      <span>
                        <strong>Orden #{o.num_orden}</strong> · {o.marca.nombre} {o.modelo.nombre}
                      </span>
                      <small className="muted">
                        {fullName(o.cliente)} · {o.estado_label}
                      </small>
                      {o.fecha_entrega && (
                        <small className="text-danger">{deliveryCountdown(o.fecha_entrega, now).text}</small>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {dueSoon.length > 0 && (
            <section aria-label="Órdenes por atrasarse">
              <header className="notif-section">
                <strong>Órdenes por atrasarse ({dueSoon.length})</strong>
                <Link to="/work-orders">Ver órdenes</Link>
              </header>
              <ul className="notif-list">
                {dueSoon.map((o) => (
                  <li key={o.id}>
                    <Link to={`/work-orders/${o.id}`} className="notif-item">
                      <span>
                        <strong>Orden #{o.num_orden}</strong> · {o.marca.nombre} {o.modelo.nombre}
                      </span>
                      <small className="muted">
                        {fullName(o.cliente)} · {o.estado_label}
                      </small>
                      {o.fecha_entrega && (
                        <small className="text-warning">{deliveryCountdown(o.fecha_entrega, now).text}</small>
                      )}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {lowStock.length > 0 && (
            <section aria-label="Productos bajo el mínimo">
              <header className="notif-section">
                <strong>Productos bajo el mínimo ({lowStock.length})</strong>
                <Link to="/products">Ver productos</Link>
              </header>
              <ul className="notif-list">
                {lowStock.map((p) => (
                  <li key={p.id}>
                    <Link to="/products" className="notif-item">
                      <span>
                        <strong>{p.nombre}</strong> <small className="muted">{p.sku}</small>
                      </span>
                      <small>
                        Stock {p.stock} de {p.minimo_recomendado} · <span className="text-danger">faltan {p.faltante}</span>
                      </small>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}
    </div>
  );
}
