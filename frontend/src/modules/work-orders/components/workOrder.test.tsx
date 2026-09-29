import { render, screen } from '@testing-library/react';
import { BalanceSummary } from './BalanceSummary';
import { workOrderSchema } from './WorkOrderForm';

const valid = {
  cliente: { id: 1, nombre: 'Juan', apellido: 'Pérez', email: 'j@example.com' },
  marca_id: '1',
  modelo_id: '2',
  tecnico_id: '',
  observacion: 'No enciende',
  estado: '0',
  garantia: false,
  color: 'Negro',
  presupuesto: '100',
  anticipo: '30',
  fecha: '2026-09-29',
};

describe('work order balance', () => {
  it('shows presupuesto, anticipo and computed saldo', () => {
    render(<BalanceSummary presupuesto="100" anticipo="30" />);
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
  });

  it('requires a client', () => {
    const result = workOrderSchema.safeParse({ ...valid, cliente: null });
    expect(result.success).toBe(false);
  });

  it('rejects an anticipo greater than the presupuesto', () => {
    const result = workOrderSchema.safeParse({ ...valid, anticipo: '150' });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0].path).toEqual(['anticipo']);
  });

  it('rejects unknown statuses', () => {
    expect(workOrderSchema.safeParse({ ...valid, estado: '5' }).success).toBe(false);
  });
});
