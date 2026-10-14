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

/** Template approved by Meta: the only messages the business can start a WhatsApp chat with. */
export interface WhatsAppTemplate {
  name: string;
  language: string;
  /** MARKETING | UTILITY | AUTHENTICATION: decides the price of each message. */
  category: string;
  /** Text with placeholders {{1}} or {{nombre}}. */
  body: string;
  header_format: 'TEXT' | 'IMAGE' | 'VIDEO' | 'DOCUMENT' | null;
  header_text: string | null;
  footer: string | null;
  body_params: string[];
  /** Placeholders in the header or the buttons: the campaigns cannot fill them. */
  unsupported_params: boolean;
}

export type ParamSource = 'NOMBRE' | 'APELLIDO' | 'NOMBRE_COMPLETO' | 'MARCA' | 'MODELO' | 'TEXTO';

export const PARAM_SOURCE_LABELS: Record<ParamSource, string> = {
  NOMBRE: 'Nombre del cliente',
  APELLIDO: 'Apellido del cliente',
  NOMBRE_COMPLETO: 'Nombre y apellido',
  MARCA: 'Marca del teléfono (@TELEFONO)',
  MODELO: 'Modelo del teléfono',
  TEXTO: 'Texto fijo',
};

export interface TemplateParam {
  source: ParamSource;
  texto?: string;
}

export interface CampaignRequest {
  plantilla: string;
  idioma: string;
  cliente_ids: number[];
  parametros: TemplateParam[];
}

export interface CampaignCreated {
  campaign_id: number;
  encolados: number;
  /** Clients skipped: no valid mobile number or a repeated number. */
  sin_numero: number;
  /** Clients skipped: they answered BAJA / STOP. */
  dados_de_baja: number;
}

export interface Campaign {
  id: number;
  plantilla: string;
  idioma: string;
  categoria: string;
  created_at: string;
  creado_por: string | null;
  total: number;
  pendientes: number;
  enviados: number;
  entregados: number;
  leidos: number;
  fallidos: number;
}

export type MessageStatus = 'PENDIENTE' | 'ENVIADO' | 'ENTREGADO' | 'LEIDO' | 'FALLIDO';

export interface CampaignMessage {
  id: number;
  cliente_id: number | null;
  cliente: string | null;
  telefono: string;
  estado: MessageStatus;
  error: string | null;
  updated_at: string;
}

export interface CampaignDetail {
  campaign: Campaign;
  messages: CampaignMessage[];
}
