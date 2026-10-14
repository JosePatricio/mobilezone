/** Client that came through Órdenes: recipient of the Propaganda (CRM) messages. */
export interface OrderClient {
  cliente_id: number;
  nombre: string;
  apellido: string;
  celular: string | null;
  /** Brand of the phone of the most recent order (variable @TELEFONO). */
  marca: string;
  modelo: string;
  ordenes: number;
  ultima_orden: string;
}

export type Channel = 'WHATSAPP' | 'SMS';

export const CHANNEL_LABELS: Record<Channel, string> = { WHATSAPP: 'WhatsApp', SMS: 'SMS' };

export type MediaKind = 'image' | 'video';

export interface MessageMedia {
  kind: MediaKind;
  file: File;
  url: string;
}
