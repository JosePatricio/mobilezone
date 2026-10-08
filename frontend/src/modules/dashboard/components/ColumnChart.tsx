import { useEffect, useRef, useState } from 'react';

export interface ColumnDatum {
  key: string;
  /** Period label on the X axis (e.g. "07/10", "Sem 05/10", "Oct 2026"). */
  label: string;
  value: number;
  /** Extra lines of the tooltip (e.g. "3 ventas"). */
  detail?: string[];
}

interface Props {
  data: ColumnDatum[];
  /** Formats values (axis ticks, tooltip and the highlighted label). */
  format: (value: number) => string;
  /** CSS color of the columns (a chart series token). */
  color: string;
  /** Describes the chart for screen readers. */
  ariaLabel: string;
  /** Counts: the axis steps by whole numbers. */
  integer?: boolean;
}

const HEIGHT = 240;
const MARGIN = { top: 20, right: 12, bottom: 28, left: 64 };
const MAX_BAR = 24; // thin marks: never fill the slot
const RADIUS = 4; // rounded data-end, square at the baseline

/** Clean axis ticks (0, 1, 2, 2.5, 5 × 10ⁿ); with ``integer`` the step is a whole number. */
export function niceTicks(max: number, count = 4, integer = false): number[] {
  if (max <= 0) return [0, 1];
  const raw = max / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const candidates = [1, 2, 2.5, 5, 10].map((m) => m * magnitude).filter((s) => !integer || Number.isInteger(s));
  const step = Math.max(integer ? 1 : 0, candidates.find((s) => s >= raw) ?? raw);
  const ticks: number[] = [];
  for (let v = 0; v <= max + step * 0.999; v += step) ticks.push(Number(v.toFixed(10)));
  return ticks;
}

/** Column with a 4px rounded top and a square base. */
function columnPath(x: number, y: number, width: number, height: number): string {
  if (height <= 0) return '';
  const r = Math.min(RADIUS, width / 2, height);
  return `M${x},${y + height}V${y + r}Q${x},${y} ${x + r},${y}H${x + width - r}Q${x + width},${y} ${x + width},${y + r}V${y + height}Z`;
}

function useWidth<T extends HTMLElement>(fallback = 640) {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(fallback);
  useEffect(() => {
    const element = ref.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.max(240, entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
}

/**
 * Single-series column chart (SVG). Columns grow from the baseline when the data changes
 * (no animation with prefers-reduced-motion); hover / focus on a column shows its tooltip.
 */
export function ColumnChart({ data, format, color, ariaLabel, integer = false }: Props) {
  const [containerRef, width] = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);

  const innerW = width - MARGIN.left - MARGIN.right;
  const innerH = HEIGHT - MARGIN.top - MARGIN.bottom;
  const max = Math.max(0, ...data.map((d) => d.value));
  const ticks = niceTicks(max, 4, integer);
  const top = ticks[ticks.length - 1] || 1;
  const band = innerW / Math.max(1, data.length);
  const barW = Math.min(MAX_BAR, band * 0.6);
  const y = (v: number) => MARGIN.top + innerH - (v / top) * innerH;
  // Thin out the X labels when the periods do not fit.
  const labelEvery = Math.ceil(56 / band);
  // Selective direct label: only the highest column.
  const maxIndex = max > 0 ? data.findIndex((d) => d.value === max) : -1;
  const activeDatum = active !== null ? data[active] : null;

  return (
    <div className="chart" ref={containerRef}>
      <svg width={width} height={HEIGHT} role="img" aria-label={ariaLabel} className="chart-svg">
        {ticks.map((t) => (
          <g key={t}>
            <line className="chart-gridline" x1={MARGIN.left} x2={width - MARGIN.right} y1={y(t)} y2={y(t)} />
            <text className="chart-tick" x={MARGIN.left - 8} y={y(t)} dy="0.32em" textAnchor="end">
              {format(t)}
            </text>
          </g>
        ))}
        <line
          className="chart-baseline"
          x1={MARGIN.left}
          x2={width - MARGIN.right}
          y1={MARGIN.top + innerH}
          y2={MARGIN.top + innerH}
        />
        {data.map((d, i) => {
          const cx = MARGIN.left + band * i + band / 2;
          const barTop = y(d.value);
          return (
            <g key={d.key}>
              <path
                className={`chart-bar${active === i ? ' chart-bar-active' : ''}`}
                style={{ fill: color, animationDelay: `${i * 35}ms` }}
                d={columnPath(cx - barW / 2, barTop, barW, MARGIN.top + innerH - barTop)}
              />
              {i === maxIndex && (
                <text
                  className="chart-value"
                  style={{ animationDelay: `${i * 35 + 450}ms` }}
                  x={cx}
                  y={barTop - 6}
                  textAnchor="middle"
                >
                  {format(d.value)}
                </text>
              )}
              {i % labelEvery === (data.length - 1) % labelEvery && (
                <text className="chart-tick" x={cx} y={HEIGHT - 8} textAnchor="middle">
                  {d.label}
                </text>
              )}
              {/* Hit target: the whole band, bigger than the mark. */}
              <rect
                className="chart-hit"
                x={MARGIN.left + band * i}
                y={MARGIN.top}
                width={band}
                height={innerH}
                tabIndex={0}
                aria-label={`${d.label}: ${format(d.value)}${d.detail ? `, ${d.detail.join(', ')}` : ''}`}
                onPointerEnter={() => setActive(i)}
                onPointerLeave={() => setActive(null)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
              />
            </g>
          );
        })}
      </svg>
      {activeDatum && active !== null && (
        <div
          className="chart-tooltip"
          role="status"
          style={{
            left: Math.min(Math.max(MARGIN.left + band * active + band / 2, 70), width - 70),
            top: Math.max(0, y(activeDatum.value) - 12),
          }}
        >
          <strong>{format(activeDatum.value)}</strong>
          <span>{activeDatum.label}</span>
          {activeDatum.detail?.map((line) => (
            <span key={line}>{line}</span>
          ))}
        </div>
      )}
    </div>
  );
}
