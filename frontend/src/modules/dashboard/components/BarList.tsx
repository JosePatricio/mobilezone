export interface BarDatum {
  key: string | number;
  label: string;
  value: number;
  /** Extra text after the value (e.g. the amount sold). */
  detail?: string;
}

interface Props {
  data: BarDatum[];
  /** Formats the value at the end of each bar. */
  format?: (value: number) => string;
  /** CSS color of the bars (a chart series token). */
  color?: string;
  /** Describes the chart for screen readers. */
  ariaLabel: string;
}

/**
 * Horizontal bar chart (ranking): one row per item with its label, a bar proportional to the
 * largest value and the value. Bars grow when mounted (no animation with prefers-reduced-motion).
 */
export function BarList({ data, format = String, color = 'var(--chart-series-1)', ariaLabel }: Props) {
  const max = Math.max(0, ...data.map((d) => d.value));
  return (
    <ol className="bar-list" aria-label={ariaLabel}>
      {data.map((d, i) => (
        <li key={d.key} className="bar-list-row">
          <span className="bar-list-label" title={d.label}>
            {d.label}
          </span>
          <span className="bar-list-track" aria-hidden="true">
            <span
              className="bar-list-bar"
              style={{ width: `${max > 0 ? (d.value / max) * 100 : 0}%`, background: color, animationDelay: `${i * 35}ms` }}
            />
          </span>
          <span className="bar-list-value">
            <strong>{format(d.value)}</strong>
            {d.detail && <small className="muted">{d.detail}</small>}
          </span>
        </li>
      ))}
    </ol>
  );
}
