import { WhatsAppIcon } from '@/shared/components';

/** Ecuador: a local mobile number "0991234567" is dialed internationally as 593991234567. */
const COUNTRY_CODE = '593';

/** Phones and tablets cannot use WhatsApp Web; they need the app link instead. */
export function isMobileDevice(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as Navigator & { userAgentData?: { mobile?: boolean } }).userAgentData;
  if (uaData?.mobile) return true;
  return /Android|iPhone|iPad|iPod|Mobile|Opera Mini|IEMobile/i.test(navigator.userAgent)
    // iPadOS reports itself as a Mac; tell it apart by its touch screen.
    || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1);
}

/**
 * Chat with the number — WhatsApp Web on desktop, the WhatsApp app on mobile —
 * or null when it is not a usable phone number.
 */
export function whatsAppUrl(celular: string | null | undefined, mobile = isMobileDevice()): string | null {
  const raw = (celular ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (!raw.startsWith('+') && digits.startsWith('0')) digits = COUNTRY_CODE + digits.slice(1);
  return mobile ? `https://wa.me/${digits}` : `https://web.whatsapp.com/send?phone=${digits}`;
}

/** WhatsApp icon that opens a chat with the client in a new tab (or the app on mobile). */
export function WhatsAppLink({ celular, nombre }: { celular: string | null | undefined; nombre: string }) {
  const url = whatsAppUrl(celular);
  if (!url) return <span className="muted" title="El cliente no tiene celular registrado">—</span>;
  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="whatsapp-link"
      aria-label={`WhatsApp de ${nombre}`}
      title={`WhatsApp: ${celular}`}
      onClick={(e) => e.stopPropagation()}
    >
      <WhatsAppIcon />
    </a>
  );
}
