import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/app/store/AuthProvider';
import { Button, DatePicker, PageHeader } from '@/shared/components';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { formatDate, todayIso } from '@/shared/utils/format';
import { DashboardCharts } from '../components/DashboardCharts';
import { DASHBOARD_KEY, dashboardApi } from '../services/dashboardApi';

/** Shifts an ISO date (YYYY-MM-DD) by whole days. */
function addDays(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function DashboardPage() {
  const { user, hasPermission } = useAuth();
  const canOrders = hasPermission(P.WORK_ORDERS_VIEW);
  const canSales = hasPermission(P.SALES_VIEW);

  return (
    <>
      <PageHeader title={`Hola, ${user?.nombre ?? ''}`}>Resumen general del sistema</PageHeader>
      {canOrders && <OrdersOfTheDay />}
      {(canSales || canOrders) && <DashboardCharts />}
    </>
  );
}

/** Work orders received, moved to En proceso and finalized on one day (default: today). */
function OrdersOfTheDay() {
  const today = todayIso();
  const [day, setDay] = useState(today);
  const query = useQuery({
    queryKey: [DASHBOARD_KEY, 'orders-day', day],
    queryFn: () => dashboardApi.ordersOfTheDay(day),
    placeholderData: keepPreviousData,
  });
  const data = query.data;
  const value = (n: number | undefined) => (n === undefined ? '…' : n);

  return (
    <section className="day-orders" aria-label="Órdenes del día">
      <div className="toolbar">
        <Button variant="secondary" size="sm" onClick={() => setDay(addDays(day, -1))} aria-label="Día anterior">
          ‹
        </Button>
        <DatePicker aria-label="Día" value={day} max={today} onChange={(e) => e.target.value && setDay(e.target.value)} />
        <Button
          variant="secondary"
          size="sm"
          onClick={() => setDay(addDays(day, 1))}
          disabled={day >= today}
          aria-label="Día siguiente"
        >
          ›
        </Button>
        <span className="muted">{day === today ? 'Hoy' : formatDate(day)}</span>
      </div>
      <div className={`stat-grid${query.isFetching ? ' is-refreshing' : ''}`}>
        <Link to="/work-orders" className="stat-card stat-info">
          <span className="stat-label">Órdenes recibidas</span>
          <span className="stat-value">{value(data?.recibidas)}</span>
        </Link>
        <Link to="/work-orders" className="stat-card stat-warning">
          <span className="stat-label">Órdenes en proceso</span>
          <span className="stat-value">{value(data?.en_proceso)}</span>
        </Link>
        <Link to="/work-orders" className="stat-card stat-success">
          <span className="stat-label">Órdenes finalizadas</span>
          <span className="stat-value">{value(data?.finalizadas)}</span>
        </Link>
      </div>
    </section>
  );
}
