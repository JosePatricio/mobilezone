import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Card, ErrorState, Loading } from '@/shared/components';
import { formatMoney, toCents } from '@/shared/utils/money';
import { DASHBOARD_KEY, dashboardApi, type Grouping, type PeriodStats } from '../services/dashboardApi';
import { ColumnChart } from './ColumnChart';

const GROUPINGS: { value: Grouping; label: string; current: string; previous: string }[] = [
  { value: 'dia', label: 'Día', current: 'Hoy', previous: 'ayer' },
  { value: 'semana', label: 'Semana', current: 'Esta semana', previous: 'la semana anterior' },
  { value: 'mes', label: 'Mes', current: 'Este mes', previous: 'el mes anterior' },
  { value: 'anio', label: 'Año', current: 'Este año', previous: 'el año anterior' },
];

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const amount = (p: PeriodStats) => toCents(p.monto ?? '0') / 100;
/** Axis ticks of money without decimals ($ 1.250); the tooltip keeps the cents. */
const formatMoneyTick = (value: number) => formatMoney(value).replace(/,00$/, '');

/** Change against the previous period: arrow + text (never color alone). */
function Delta({ current, previous, label }: { current: number; previous: number; label: string }) {
  if (previous === current) return <span className="stat-delta">= que {label}</span>;
  const up = current > previous;
  const pct = previous > 0 ? `${Math.round((Math.abs(current - previous) / previous) * 100)} %` : 'nuevo';
  return (
    <span className={`stat-delta ${up ? 'stat-delta-up' : 'stat-delta-down'}`}>
      <span aria-hidden>{up ? '▲' : '▼'}</span> {pct} vs {label}
    </span>
  );
}

/** Animated charts of sales and work orders per day, week, month or year. */
export function DashboardCharts() {
  const [grouping, setGrouping] = useState<Grouping>('dia');
  const query = useQuery({
    queryKey: [DASHBOARD_KEY, 'charts', grouping],
    queryFn: () => dashboardApi.charts(grouping),
    placeholderData: keepPreviousData,
  });
  const meta = GROUPINGS.find((g) => g.value === grouping)!;

  if (query.isLoading) return <Loading />;
  if (query.isError || !query.data) return <ErrorState error={query.error} onRetry={() => query.refetch()} />;

  const { periodos, agrupacion } = query.data;
  const current = periodos[periodos.length - 1];
  const previous = periodos[periodos.length - 2];
  const showSales = current.ventas !== null;
  const showOrders = current.ordenes !== null;
  // Remount the charts when new data arrives so the columns grow again.
  const chartKey = `${agrupacion}-${periodos[0]?.inicio}`;

  return (
    <section className={`dashboard-charts${query.isFetching ? ' is-refreshing' : ''}`} aria-label="Gráficos">
      <div className="segmented" role="radiogroup" aria-label="Agrupar por">
        {GROUPINGS.map((g) => (
          <button
            key={g.value}
            type="button"
            role="radio"
            aria-checked={grouping === g.value}
            className={grouping === g.value ? 'active' : ''}
            onClick={() => setGrouping(g.value)}
          >
            {g.label}
          </button>
        ))}
      </div>

      <div className="stat-grid">
        {showSales && (
          <>
            <div className="stat-card">
              <span className="stat-label">{meta.current} · cobrado</span>
              <span className="stat-value">{formatMoney(current.monto)}</span>
              {previous && <Delta current={amount(current)} previous={amount(previous)} label={meta.previous} />}
            </div>
            <div className="stat-card">
              <span className="stat-label">{meta.current} · ventas</span>
              <span className="stat-value">{current.ventas}</span>
              {previous && <Delta current={current.ventas ?? 0} previous={previous.ventas ?? 0} label={meta.previous} />}
            </div>
          </>
        )}
        {showOrders && (
          <div className="stat-card stat-warning">
            <span className="stat-label">{meta.current} · órdenes recibidas</span>
            <span className="stat-value">{current.ordenes}</span>
            {previous && <Delta current={current.ordenes ?? 0} previous={previous.ordenes ?? 0} label={meta.previous} />}
          </div>
        )}
      </div>

      <div className="chart-grid">
        {showSales && (
          <Card title="Ventas (total cobrado)">
            <ColumnChart
              key={`sales-${chartKey}`}
              ariaLabel={`Total cobrado por ${meta.label.toLowerCase()}`}
              color="var(--chart-series-1)"
              format={formatMoneyTick}
              data={periodos.map((p) => ({
                key: p.inicio,
                label: p.etiqueta,
                value: amount(p),
                detail: [plural(p.ventas ?? 0, 'venta', 'ventas')],
              }))}
            />
          </Card>
        )}
        {showOrders && (
          <Card title="Órdenes de trabajo recibidas">
            <ColumnChart
              key={`orders-${chartKey}`}
              ariaLabel={`Órdenes recibidas por ${meta.label.toLowerCase()}`}
              color="var(--chart-series-2)"
              integer
              format={(v) => String(v)}
              data={periodos.map((p) => ({ key: p.inicio, label: p.etiqueta, value: p.ordenes ?? 0 }))}
            />
          </Card>
        )}
      </div>

      <details className="chart-table">
        <summary>Ver datos en tabla</summary>
        <div className="table-wrapper">
          <table className="table table-compact">
            <thead>
              <tr>
                <th>Período</th>
                {showSales && <th className="text-right">Ventas</th>}
                {showSales && <th className="text-right">Cobrado</th>}
                {showOrders && <th className="text-right">Órdenes</th>}
              </tr>
            </thead>
            <tbody>
              {periodos.map((p) => (
                <tr key={p.inicio}>
                  <td>{p.etiqueta}</td>
                  {showSales && <td className="text-right">{p.ventas}</td>}
                  {showSales && <td className="text-right">{formatMoney(p.monto)}</td>}
                  {showOrders && <td className="text-right">{p.ordenes}</td>}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </section>
  );
}
