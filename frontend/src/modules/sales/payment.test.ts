import { calculatePayment } from './payment';

describe('payment', () => {
  it('adds 6 % for credit card, rounded to cents', () => {
    expect(calculatePayment('100.00', 'TARJETA')).toMatchObject({ recargo: '6.00', totalPagar: '106.00' });
    expect(calculatePayment('19.99', 'TARJETA')).toMatchObject({ recargo: '1.20', totalPagar: '21.19' });
  });

  it('computes the change for cash', () => {
    expect(calculatePayment('45.50', 'EFECTIVO', '50')).toMatchObject({ cambio: '4.50', insuficiente: false });
    expect(calculatePayment('45.50', 'EFECTIVO', '40')).toMatchObject({ cambio: null, insuficiente: true });
    expect(calculatePayment('45.50', 'EFECTIVO', '')).toMatchObject({ cambio: null, insuficiente: false });
  });

  it('transfer has no surcharge', () => {
    expect(calculatePayment('10.00', 'TRANSFERENCIA')).toMatchObject({ recargo: '0.00', totalPagar: '10.00' });
  });
});
