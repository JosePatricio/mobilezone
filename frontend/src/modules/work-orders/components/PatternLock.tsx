import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';

/** Dots 1..9, row by row (like the Android unlock pattern). */
const DOTS = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const SIZE = 240;
const STEP = SIZE / 3;
const HIT_RADIUS = STEP * 0.32;
export const MIN_PATTERN_DOTS = 4;

const center = (dot: number) => ({
  x: ((dot - 1) % 3) * STEP + STEP / 2,
  y: Math.floor((dot - 1) / 3) * STEP + STEP / 2,
});

export function parsePattern(value: string | null | undefined): number[] {
  return (value ?? '')
    .split('-')
    .map(Number)
    .filter((n) => n >= 1 && n <= 9);
}

export const formatPattern = (dots: number[]) => dots.join('-');

/**
 * Adds a dot to the pattern like Android does: a dot already used is ignored and a
 * skipped dot lying between two dots (e.g. 1 → 3 passes over 2) is added first.
 */
export function addDot(path: number[], dot: number): number[] {
  if (path.includes(dot)) return path;
  const last = path[path.length - 1];
  if (last !== undefined) {
    const a = center(last);
    const b = center(dot);
    const middleX = (a.x + b.x) / 2;
    const middleY = (a.y + b.y) / 2;
    const middle = DOTS.find((d) => center(d).x === middleX && center(d).y === middleY);
    if (middle !== undefined && middle !== last && middle !== dot && !path.includes(middle)) {
      return [...path, middle, dot];
    }
  }
  return [...path, dot];
}

interface PatternLockProps {
  /** "1-5-9-6" */
  value: string | null;
  onChange?: (value: string) => void;
  /** Read-only: shows the stored pattern with the order of each dot. */
  readOnly?: boolean;
  label?: string;
}

/** 3x3 pattern pad drawn with the mouse or the finger (pointer events). */
export function PatternLock({ value, onChange, readOnly = false, label = 'Patrón de desbloqueo' }: PatternLockProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drawing, setDrawing] = useState<number[] | null>(null);
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null);
  const path = drawing ?? parsePattern(value);

  const toLocal = (e: PointerEvent<SVGSVGElement>) => {
    const rect = svgRef.current!.getBoundingClientRect();
    const scale = rect.width ? SIZE / rect.width : 1;
    return { x: (e.clientX - rect.left) * scale, y: (e.clientY - rect.top) * scale };
  };
  const dotAt = (p: { x: number; y: number }) =>
    DOTS.find((d) => {
      const c = center(d);
      return Math.hypot(c.x - p.x, c.y - p.y) <= HIT_RADIUS;
    });

  const onPointerDown = (e: PointerEvent<SVGSVGElement>) => {
    if (readOnly) return;
    e.preventDefault();
    svgRef.current?.setPointerCapture?.(e.pointerId);
    const p = toLocal(e);
    const dot = dotAt(p);
    setDrawing(dot ? [dot] : []);
    setPointer(p);
  };
  const onPointerMove = (e: PointerEvent<SVGSVGElement>) => {
    if (readOnly || drawing === null) return;
    const p = toLocal(e);
    setPointer(p);
    const dot = dotAt(p);
    if (dot !== undefined) setDrawing((prev) => addDot(prev ?? [], dot));
  };
  const finish = () => {
    if (drawing === null) return;
    if (drawing.length > 0) onChange?.(formatPattern(drawing));
    setDrawing(null);
    setPointer(null);
  };

  // Keyboard alternative: focus a dot and press Enter / Space to add it.
  const onDotKey = (dot: number) => (e: KeyboardEvent<SVGCircleElement>) => {
    if (readOnly || (e.key !== 'Enter' && e.key !== ' ')) return;
    e.preventDefault();
    onChange?.(formatPattern(addDot(parsePattern(value), dot)));
  };

  const last = path[path.length - 1];
  return (
    <div className={`pattern-lock ${readOnly ? 'pattern-lock-readonly' : ''}`}>
      <svg
        ref={svgRef}
        viewBox={`0 0 ${SIZE} ${SIZE}`}
        role="group"
        aria-label={`${label}${path.length ? `: ${formatPattern(path)}` : ''}`}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={finish}
        onPointerCancel={finish}
        onPointerLeave={(e) => e.buttons === 0 && finish()}
      >
        {path.length > 1 && (
          <polyline
            className="pattern-line"
            points={path.map((d) => `${center(d).x},${center(d).y}`).join(' ')}
          />
        )}
        {drawing && pointer && last !== undefined && (
          <line className="pattern-line pattern-line-live" x1={center(last).x} y1={center(last).y} x2={pointer.x} y2={pointer.y} />
        )}
        {DOTS.map((dot) => {
          const c = center(dot);
          const order = path.indexOf(dot);
          return (
            <g key={dot}>
              <circle
                className={`pattern-dot ${order >= 0 ? 'active' : ''}`}
                cx={c.x}
                cy={c.y}
                r={order >= 0 ? 14 : 10}
                tabIndex={readOnly ? undefined : 0}
                role={readOnly ? undefined : 'button'}
                aria-label={readOnly ? undefined : `Punto ${dot}`}
                onKeyDown={onDotKey(dot)}
              />
              {readOnly && order >= 0 && (
                <text className="pattern-order" x={c.x} y={c.y} dy="0.35em" textAnchor="middle">
                  {order + 1}
                </text>
              )}
            </g>
          );
        })}
      </svg>
    </div>
  );
}
