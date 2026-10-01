import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { Combobox } from '@/shared/components/Combobox';
import { BalanceSummary } from './BalanceSummary';
import { addDot, PatternLock } from './PatternLock';
import { workOrderSchema } from './WorkOrderForm';

// jsdom has no PointerEvent: without it the coordinates of fireEvent.pointer* are lost.
if (!('PointerEvent' in window)) {
  class PointerEventPolyfill extends MouseEvent {
    pointerId: number;
    constructor(type: string, init: PointerEventInit = {}) {
      super(type, init);
      this.pointerId = init.pointerId ?? 1;
    }
  }
  Object.assign(window, { PointerEvent: PointerEventPolyfill });
}

const valid = {
  cliente: { identificacion: '1712345675', nombre: 'Juan', apellido: 'Pérez', celular: '099 123 4567' },
  marca_id: '1',
  modelo_id: '2',
  color: 'Negro',
  motivo_ingreso: 'BATERIA',
  tipo_display: '',
  tipo_garantia: 'SIN_GARANTIA',
  bloqueo_tipo: 'NINGUNO',
  bloqueo_valor: '',
  tecnico_id: '',
  observacion: 'No carga',
  estado: '0',
  presupuesto: '100',
  anticipo: '30',
  fecha: '2026-09-29',
};

describe('work order balance', () => {
  it('shows costo de reparación, anticipo and computed saldo', () => {
    render(<BalanceSummary presupuesto="100" anticipo="30" />);
    expect(screen.getByText('Costo de reparación')).toBeInTheDocument();
    expect(screen.getByTestId('balance-saldo')).toHaveTextContent('70,00');
  });

  it('prefers the definitive saldo from the backend', () => {
    render(<BalanceSummary presupuesto="100" anticipo="30" saldo="65.00" />);
    expect(screen.getByTestId('balance-saldo')).toHaveTextContent('65,00');
  });
});

describe('work order form validation', () => {
  it('accepts a valid order and normalizes values', () => {
    const result = workOrderSchema.parse(valid);
    expect(result.presupuesto).toBe('100.00');
    expect(result.marca_id).toBe(1);
    expect(result.tecnico_id).toBeNull();
    expect(result.cliente.celular).toBe('0991234567');
    expect(result.tipo_display).toBeNull();
    expect(result.bloqueo_valor).toBeNull();
  });

  it('requires a valid client cédula and names', () => {
    const result = workOrderSchema.safeParse({ ...valid, cliente: { ...valid.cliente, identificacion: '1234567890', nombre: '' } });
    expect(result.success).toBe(false);
    const paths = result.error?.issues.map((i) => i.path.join('.'));
    expect(paths).toEqual(expect.arrayContaining(['cliente.identificacion', 'cliente.nombre']));
  });

  it('rejects an anticipo greater than the repair cost', () => {
    const result = workOrderSchema.safeParse({ ...valid, anticipo: '150' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['anticipo']);
  });

  it('requires the display type only for a display change', () => {
    const missing = workOrderSchema.safeParse({ ...valid, motivo_ingreso: 'CAMBIO_DISPLAY' });
    expect(missing.error?.issues[0].path).toEqual(['tipo_display']);
    const ok = workOrderSchema.parse({ ...valid, motivo_ingreso: 'CAMBIO_DISPLAY', tipo_display: 'OLED' });
    expect(ok.tipo_display).toBe('OLED');
    expect(workOrderSchema.parse({ ...valid, tipo_display: 'OLED' }).tipo_display).toBeNull();
  });

  it('validates the pattern (4+ dots) and the PIN (4 to 12 digits)', () => {
    expect(workOrderSchema.safeParse({ ...valid, bloqueo_tipo: 'PATRON', bloqueo_valor: '1-2-3' }).success).toBe(false);
    expect(workOrderSchema.parse({ ...valid, bloqueo_tipo: 'PATRON', bloqueo_valor: '1-2-3-6' }).bloqueo_valor).toBe('1-2-3-6');
    expect(workOrderSchema.safeParse({ ...valid, bloqueo_tipo: 'PIN', bloqueo_valor: '12' }).success).toBe(false);
    expect(workOrderSchema.parse({ ...valid, bloqueo_tipo: 'PIN', bloqueo_valor: '1234' }).bloqueo_valor).toBe('1234');
  });

  it('rejects unknown statuses', () => {
    expect(workOrderSchema.safeParse({ ...valid, estado: '5' }).success).toBe(false);
  });
});

describe('pattern lock', () => {
  it('adds the dot skipped between two dots, like Android', () => {
    expect(addDot([1], 3)).toEqual([1, 2, 3]);
    expect(addDot([1], 9)).toEqual([1, 5, 9]);
    expect(addDot([1, 5], 9)).toEqual([1, 5, 9]);
    expect(addDot([2], 8)).toEqual([2, 5, 8]);
    expect(addDot([1], 6)).toEqual([1, 6]); // no dot in between
    expect(addDot([1, 2], 2)).toEqual([1, 2]); // already used
  });

  it('draws a pattern with the pointer (mouse or touch)', () => {
    let value = '';
    render(<PatternLock value={null} onChange={(v) => (value = v)} />);
    const svg = screen.getByRole('group');
    // jsdom has no layout: the viewBox (240 x 240) is used as coordinates.
    const at = (dot: number) => ({ clientX: ((dot - 1) % 3) * 80 + 40, clientY: Math.floor((dot - 1) / 3) * 80 + 40, pointerId: 1 });
    fireEvent.pointerDown(svg, at(1));
    fireEvent.pointerMove(svg, at(2));
    fireEvent.pointerMove(svg, at(5));
    fireEvent.pointerMove(svg, at(9));
    fireEvent.pointerUp(svg, at(9));
    expect(value).toBe('1-2-5-9');
  });

  it('can be entered with the keyboard', async () => {
    function Harness() {
      const [value, setValue] = useState('');
      return (
        <>
          <PatternLock value={value} onChange={setValue} />
          <output>{value}</output>
        </>
      );
    }
    render(<Harness />);
    for (const dot of [7, 8, 9]) {
      screen.getByRole('button', { name: `Punto ${dot}` }).focus();
      await userEvent.keyboard('{Enter}');
    }
    expect(screen.getByRole('status')).toHaveTextContent('7-8-9');
  });

  it('shows the stored pattern in read-only mode', () => {
    render(<PatternLock value="3-5-7-8" readOnly />);
    expect(screen.getByRole('group', { name: 'Patrón de desbloqueo: 3-5-7-8' })).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });
});

describe('searchable select (motivo de ingreso)', () => {
  const options = [
    { value: 'CAMBIO_DISPLAY', label: 'Cambio de display' },
    { value: 'BATERIA', label: 'Batería' },
    { value: 'CRISTAL_CAMARA', label: 'Cristal de cámara' },
  ];

  it('filters while typing (ignoring accents) and selects with Enter', async () => {
    let selected = '';
    render(<Combobox label="Motivo de ingreso" options={options} value="" onChange={(v) => (selected = v)} />);
    await userEvent.click(screen.getByRole('button', { name: /Motivo de ingreso/ }));
    await userEvent.type(screen.getByRole('searchbox', { name: 'Buscar motivo de ingreso' }), 'camara');
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['Cristal de cámara']);
    await userEvent.keyboard('{Enter}');
    expect(selected).toBe('CRISTAL_CAMARA');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
