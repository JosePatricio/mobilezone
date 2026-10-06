import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/utils';
import type { WorkOrder } from '../types';
import { PrintableOrder } from './PrintableOrder';

const order = {
  id: 1,
  num_orden: 12,
  codigo_publico: 'abc',
  fecha: '2026-10-06',
  fecha_entrega: null,
  cliente: { id: 7, nombre: 'Juan', apellido: 'Pérez', identificacion: '1712345675', celular: null, email: null },
  marca: { id: 1, nombre: 'Samsung' },
  modelo: { id: 2, nombre: 'A10' },
  modelo_tecnico: null,
  color: null,
  motivo_ingreso: 'PANTALLA',
  motivo_ingreso_label: 'Pantalla',
  tipo_display: null,
  bloqueo_tipo: 'NINGUNO',
  bloqueo_valor: null,
  observacion: null,
  presupuesto: '50.00',
  anticipo: '0.00',
  saldo: '50.00',
  garantia_dias: 0,
  estado: 0,
  estado_label: 'Recibido',
  tecnico: { id: 1, nombre: 'Ana', apellido: 'Pérez', email: null },
  branch_id: 1,
  branch: { id: 1, nombre: 'Matriz', ubicacion: 'Centro', direccion: 'Av. Amazonas N24-12', telefono: '022345678' },
} as unknown as WorkOrder;

describe('PrintableOrder', () => {
  it('prints the address and phone of the branch', () => {
    renderWithProviders(<PrintableOrder order={order} />);
    expect(screen.getByText('Matriz')).toBeInTheDocument();
    expect(screen.getByText('Av. Amazonas N24-12')).toBeInTheDocument();
    expect(screen.getByText('Tel.: 022345678')).toBeInTheDocument();
  });

  it('uses the location when the branch has no address yet', () => {
    const withoutAddress = { ...order, branch: { ...order.branch!, direccion: null, telefono: null } };
    renderWithProviders(<PrintableOrder order={withoutAddress} />);
    expect(screen.getByText('Centro')).toBeInTheDocument();
    expect(screen.queryByText(/Tel\.:/)).not.toBeInTheDocument();
  });
});
