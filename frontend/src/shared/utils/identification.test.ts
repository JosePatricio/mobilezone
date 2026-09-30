import { cedulaCheckDigit, isValidCedula, isValidIdentificacion, isValidRuc } from './identification';

describe('cédula / RUC (Ecuador)', () => {
  it.each(['1712345675', '0102030400', '0911111110', '3050000003'])('accepts the valid cédula %s', (value) => {
    expect(isValidCedula(value)).toBe(true);
  });

  it.each([
    ['1712345678', 'wrong check digit'],
    ['2512345678', 'province 25'],
    ['1762345675', 'third digit > 5'],
    ['12345', 'length'],
  ])('rejects %s (%s)', (value) => {
    expect(isValidCedula(value)).toBe(false);
  });

  it('computes the módulo 10 check digit', () => {
    expect(cedulaCheckDigit('171234567')).toBe(5);
  });

  it('validates RUC', () => {
    expect(isValidRuc('1712345675001')).toBe(true); // natural person
    expect(isValidRuc('1790012345001')).toBe(true); // private company
    expect(isValidRuc('1760001550001')).toBe(true); // public entity
    expect(isValidRuc('1712345675000')).toBe(false);
    expect(isValidRuc('1780012345001')).toBe(false);
  });

  it('ignores spaces and dashes', () => {
    expect(isValidIdentificacion(' 171234567-5 ')).toBe(true);
  });
});
