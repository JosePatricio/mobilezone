/** Common phone colors; the name is what is stored in the order. */
export const PHONE_COLORS: { name: string; hex: string }[] = [
  { name: 'Negro', hex: '#111827' },
  { name: 'Blanco', hex: '#ffffff' },
  { name: 'Gris', hex: '#6b7280' },
  { name: 'Plateado', hex: '#c0c4cc' },
  { name: 'Dorado', hex: '#d4af37' },
  { name: 'Rosado', hex: '#f4a6c0' },
  { name: 'Rojo', hex: '#dc2626' },
  { name: 'Naranja', hex: '#f97316' },
  { name: 'Amarillo', hex: '#facc15' },
  { name: 'Verde', hex: '#16a34a' },
  { name: 'Celeste', hex: '#7dd3fc' },
  { name: 'Azul', hex: '#1d4ed8' },
  { name: 'Morado', hex: '#7c3aed' },
  { name: 'Café', hex: '#7c4a2d' },
];

interface Props {
  value: string | null | undefined;
  onChange: (value: string) => void;
  error?: string;
}

/** Color of the device chosen from a palette (click again to clear). */
export function ColorPalette({ value, onChange, error }: Props) {
  const current = value ?? '';
  // A color typed in an older order that is not in the palette is kept as its own option.
  const colors = current && !PHONE_COLORS.some((c) => c.name === current) ? [...PHONE_COLORS, { name: current, hex: '' }] : PHONE_COLORS;
  return (
    <div className={`field full ${error ? 'field-invalid' : ''}`}>
      <span className="field-label" id="color-palette-label">
        Color{current ? `: ${current}` : ''}
      </span>
      <div className="color-palette" role="radiogroup" aria-labelledby="color-palette-label">
        {colors.map((color) => {
          const selected = color.name === current;
          return (
            <button
              key={color.name}
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={color.name}
              title={color.name}
              className={`color-swatch ${selected ? 'selected' : ''} ${color.hex ? '' : 'color-swatch-text'}`}
              style={color.hex ? { background: color.hex } : undefined}
              onClick={() => onChange(selected ? '' : color.name)}
            >
              {color.hex ? '' : color.name}
            </button>
          );
        })}
      </div>
      {error && (
        <p className="field-error" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
