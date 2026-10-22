import { useId } from 'react';

/** Colors of the slices, in turn (brand colors first). */
const COLORS = ['#ff006f', '#ff7014', '#241d18', '#ffb000', '#7c3aed', '#0ea5e9', '#16a34a', '#e11d48'];
/** Text on these slices is dark; on the rest it is white. */
const LIGHT = new Set(['#ffb000']);
/** How long the wheel turns before it stops (ms). */
export const SPIN_MS = 5000;

export interface WheelOption {
  nombre: string;
  imagen_url: string | null;
}

interface Props {
  items: WheelOption[];
  /** Degrees turned clockwise; changing it spins the wheel to that angle. */
  rotation?: number;
  spinning?: boolean;
  size?: number;
  label?: string;
}

/** Color of slice i; the last one never matches the first (they touch on a circle). */
function sliceColor(i: number, total: number): string {
  const color = COLORS[i % COLORS.length];
  return i === total - 1 && total > 1 && color === COLORS[0] ? COLORS[1] : color;
}

function point(angle: number, radius: number): [number, number] {
  const rad = ((angle - 90) * Math.PI) / 180; // 0° = top, clockwise
  return [radius * Math.cos(rad), radius * Math.sin(rad)];
}

function short(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

/**
 * Rotation that leaves option `index` under the pointer (top), after `turns` full turns.
 * `jitter` (-0.5…0.5) moves it inside its slice so it does not always stop at the center.
 */
export function rotationFor(index: number, total: number, turns = 6, jitter = 0): number {
  const slice = 360 / total;
  return turns * 360 - (index + 0.5) * slice + jitter * slice * 0.7;
}

/** The wheel: one slice per option, with its name and image; the pointer is on top. */
export function RouletteWheel({ items, rotation = 0, spinning = false, size = 320, label = 'Ruleta' }: Props) {
  const id = useId().replace(/:/g, '');
  const total = items.length;
  const slice = 360 / Math.max(total, 1);
  const R = 96;
  // Smaller images and text when there are many slices.
  const imageSize = Math.min(30, Math.max(14, 2 * Math.PI * 78 * (slice / 360) * 0.7));
  // The text runs along the radius: as tall as the slice allows, as long as the space to the image.
  const maxFont = Math.min(10, 2 * Math.PI * 45 * (slice / 360) * 0.8);

  return (
    <svg
      className="roulette-wheel"
      viewBox="-100 -108 200 210"
      width={size}
      height={size}
      role="img"
      aria-label={`${label}: ${items.map((i) => i.nombre).join(', ')}`}
    >
      <circle r={R + 3} fill="#241d18" />
      <g
        style={{
          transform: `rotate(${rotation}deg)`,
          transformOrigin: '0px 0px',
          transition: spinning ? `transform ${SPIN_MS}ms cubic-bezier(0.15, 0.7, 0.1, 1)` : 'none',
        }}
      >
        {total === 0 && <circle r={R} fill="#e8e8e8" />}
        {total === 1 && <circle r={R} fill={COLORS[0]} />}
        {items.map((item, i) => {
          const color = sliceColor(i, total);
          const [x1, y1] = point(i * slice, R);
          const [x2, y2] = point((i + 1) * slice, R);
          const center = (i + 0.5) * slice;
          const ink = LIGHT.has(color) ? '#241d18' : '#ffffff';
          const textCenter = item.imagen_url ? -40 : -54;
          const room = item.imagen_url ? 44 : 66;
          const text = short(item.nombre || '…', 22);
          const fontSize = Math.max(5, Math.min(maxFont, room / (text.length * 0.6)));
          return (
            <g key={i}>
              {total > 1 && (
                <path
                  d={`M0 0 L${x1} ${y1} A${R} ${R} 0 ${slice > 180 ? 1 : 0} 1 ${x2} ${y2} Z`}
                  fill={color}
                  stroke="#ffffff"
                  strokeWidth={0.8}
                />
              )}
              <g transform={`rotate(${center})`}>
                {item.imagen_url && (
                  <>
                    <clipPath id={`${id}-clip-${i}`}>
                      <circle cx={0} cy={-78} r={imageSize / 2} />
                    </clipPath>
                    <circle cx={0} cy={-78} r={imageSize / 2 + 1.2} fill="#ffffff" />
                    <image
                      href={item.imagen_url}
                      x={-imageSize / 2}
                      y={-78 - imageSize / 2}
                      width={imageSize}
                      height={imageSize}
                      preserveAspectRatio="xMidYMid slice"
                      clipPath={`url(#${id}-clip-${i})`}
                    />
                  </>
                )}
                <text
                  transform={`translate(0 ${textCenter}) rotate(-90)`}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fill={ink}
                  fontSize={fontSize}
                  fontWeight={700}
                >
                  {text}
                </text>
              </g>
            </g>
          );
        })}
      </g>
      <circle r={13} fill="#ffffff" stroke="#241d18" strokeWidth={3} />
      <circle r={4} fill="#ff006f" />
      {/* Pointer */}
      <path d="M-9 -106 L9 -106 L0 -86 Z" fill="#ffffff" stroke="#241d18" strokeWidth={2.5} strokeLinejoin="round" />
    </svg>
  );
}
