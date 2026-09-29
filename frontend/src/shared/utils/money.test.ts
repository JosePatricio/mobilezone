import { calculateBalance, formatMoney, fromCents, isValidMoney, multiplyMoney, normalizeMoney, toCents } from './money';

describe('money utils', () => {
  it('converts to and from cents without floating point errors', () => {
    expect(toCents('0.1') + toCents('0.2')).toBe(30);
    expect(fromCents(30)).toBe('0.30');
    expect(fromCents(-705)).toBe('-7.05');
    expect(toCents('10,50')).toBe(1050);
  });

  it('multiplies price by quantity', () => {
    expect(fromCents(multiplyMoney('10.00', 2) + multiplyMoney('25.00', 1))).toBe('45.00');
  });

  it('calculates saldo = presupuesto - anticipo', () => {
    expect(calculateBalance('100', '30')).toBe('70.00');
    expect(calculateBalance('99.99', '0.99')).toBe('99.00');
  });

  it('validates money input', () => {
    expect(isValidMoney('10')).toBe(true);
    expect(isValidMoney('10.5')).toBe(true);
    expect(isValidMoney('10,55')).toBe(true);
    expect(isValidMoney('10.555')).toBe(false);
    expect(isValidMoney('-1')).toBe(false);
    expect(isValidMoney('abc')).toBe(false);
    expect(normalizeMoney('7,5')).toBe('7.50');
  });

  it('formats money', () => {
    expect(formatMoney('45')).toMatch(/45,00/);
  });
});
