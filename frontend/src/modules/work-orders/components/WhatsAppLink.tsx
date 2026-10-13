import { WhatsAppIcon } from '@/shared/components';

/** Ecuador: a local mobile number "0991234567" is dialed internationally as 593991234567. */
const COUNTRY_CODE = '593';

/** WhatsApp Web chat with the number, or null when it is not a usable phone number. */
export function whatsAppUrl(celular: string | null | undefined): string | null {
  const raw = (celular ?? '').trim();
  let digits = raw.replace(/\D/g, '');
  if (digits.length < 7) return null;
  if (!raw.startsWith('+') && digits.startsWith('0')) digits = COUNTRY_CODE + digits.slice(1);
  return `https://web.whatsapp.com/send?phone=${digits}`;
}

/** WhatsApp icon that opens a chat with the client in a new tab. */
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
