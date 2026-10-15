import { whatsAppUrl } from './WhatsAppLink';

describe('whatsAppUrl', () => {
  it('uses the international number of the client', () => {
    expect(whatsAppUrl('0991234567')).toBe('https://web.whatsapp.com/send?phone=593991234567');
    expect(whatsAppUrl('+593 99 123 4567')).toBe('https://web.whatsapp.com/send?phone=593991234567');
    expect(whatsAppUrl('593991234567')).toBe('https://web.whatsapp.com/send?phone=593991234567');
  });

  it('opens the WhatsApp app on mobile', () => {
    expect(whatsAppUrl('0991234567', true)).toBe('https://wa.me/593991234567');
    expect(whatsAppUrl('+593 99 123 4567', true)).toBe('https://wa.me/593991234567');
    expect(whatsAppUrl('123', true)).toBeNull();
  });

  it('no usable number, no link', () => {
    expect(whatsAppUrl(null)).toBeNull();
    expect(whatsAppUrl('  ')).toBeNull();
    expect(whatsAppUrl('123')).toBeNull();
  });
});
