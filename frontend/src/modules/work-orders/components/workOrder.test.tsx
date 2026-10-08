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
  cliente: { identificacion: '1712345675', nombre: 'Juan', apellido: 'Pérez', celular: '099 123 4567', email: '' },
  marca_id: '1',
  modelo_id: '2',
  color: 'Negro',
  modelo_tecnico: ' SM-A105M ',
  motivo_ingreso: 'BATERIA',
  tipo_display: '',
  garantia_dias: '30',
  bloqueo_tipo: 'NINGUNO',
  patron: '',
  pin: '',
  observacion: 'No carga',
  presupuesto: '100',
  anticipo: '30',
  fecha_entrega: '',
  fecha_hora: '2026-10-08T09:30',
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
    expect(result.garantia_dias).toBe(30);
    expect(result.modelo_tecnico).toBe('SM-A105M');
    expect(result.cliente.email).toBeNull();
    expect(result.fecha_entrega).toBeNull();
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
    expect(workOrderSchema.safeParse({ ...valid, bloqueo_tipo: 'PATRON', patron: '1-2-3' }).success).toBe(false);
    expect(workOrderSchema.parse({ ...valid, bloqueo_tipo: 'PATRON', patron: '1-2-3-6' }).bloqueo_valor).toBe('1-2-3-6');
    expect(workOrderSchema.safeParse({ ...valid, bloqueo_tipo: 'PIN', pin: '12' }).success).toBe(false);
    expect(workOrderSchema.parse({ ...valid, bloqueo_tipo: 'PIN', pin: '1234' }).bloqueo_valor).toBe('1234');
  });

  it('sends only the value of the selected lock type (the other one is kept in the form)', () => {
    const result = workOrderSchema.parse({ ...valid, bloqueo_tipo: 'PIN', pin: '1234', patron: '1-2-3-6' });
    expect(result.bloqueo_valor).toBe('1234');
    expect(result).not.toHaveProperty('patron');
  });

  it('accepts warranty days from 0 and rejects negative or decimal values', () => {
    expect(workOrderSchema.parse({ ...valid, garantia_dias: '' }).garantia_dias).toBe(0);
    expect(workOrderSchema.safeParse({ ...valid, garantia_dias: '-1' }).success).toBe(false);
    expect(workOrderSchema.safeParse({ ...valid, garantia_dias: '1.5' }).success).toBe(false);
  });

  it('converts the delivery date (local date and time) to ISO', () => {
    const result = workOrderSchema.parse({ ...valid, fecha_entrega: '2026-10-05T16:30' });
    expect(result.fecha_entrega).toBe(new Date(2026, 9, 5, 16, 30).toISOString());
  });

  it('requires the reception date and time and converts it to ISO', () => {
    expect(workOrderSchema.parse(valid).fecha_hora).toBe(new Date(2026, 9, 8, 9, 30).toISOString());
    const missing = workOrderSchema.safeParse({ ...valid, fecha_hora: '' });
    expect(missing.success).toBe(false);
    expect(missing.error?.issues[0].path).toEqual(['fecha_hora']);
  });

  it('validates the client email when it is entered', () => {
    expect(workOrderSchema.safeParse({ ...valid, cliente: { ...valid.cliente, email: 'no-es-email' } }).success).toBe(false);
    expect(workOrderSchema.parse({ ...valid, cliente: { ...valid.cliente, email: 'juan@example.com' } }).cliente.email).toBe(
      'juan@example.com',
    );
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

  it('keeps the drawn pattern and continues it dot by dot (it is never erased by a new touch)', () => {
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
    const svg = screen.getByRole('group');
    const tap = (dot: number) => {
      const at = { clientX: ((dot - 1) % 3) * 80 + 40, clientY: Math.floor((dot - 1) / 3) * 80 + 40, pointerId: 1 };
      fireEvent.pointerDown(svg, at);
      fireEvent.pointerUp(svg, at);
    };
    tap(1);
    tap(2);
    tap(6);
    tap(9);
    expect(screen.getByRole('status')).toHaveTextContent('1-2-6-9');
    // Every dot of the pattern stays highlighted with its order number.
    expect(svg.querySelectorAll('.pattern-dot.active')).toHaveLength(4);
    expect(svg.querySelector('polyline')).not.toBeNull();
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
