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
  /** Cédula / RUC. */
  identificacion?: string | null;
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

export type ParamSource = 'NOMBRE' | 'APELLIDO' | 'NOMBRE_COMPLETO' | 'MARCA' | 'MODELO' | 'TEXTO' | 'RULETA';

export const PARAM_SOURCE_LABELS: Record<ParamSource, string> = {
  NOMBRE: 'Nombre del cliente',
  APELLIDO: 'Apellido del cliente',
  NOMBRE_COMPLETO: 'Nombre y apellido',
  MARCA: 'Marca del teléfono (@TELEFONO)',
  MODELO: 'Modelo del teléfono',
  TEXTO: 'Texto fijo',
  RULETA: 'Enlace de la ruleta',
};

export interface TemplateParam {
  source: ParamSource;
  texto?: string;
}

export interface CampaignRequest {
  plantilla: string;
  idioma: string;
  cliente_ids: number[];
  /** Numbers typed by hand, sent without client data (not offered on the page). */
  numeros?: string[];
  parametros: TemplateParam[];
  /** "¿Incluir ruleta?": its link goes in the RULETA placeholder, one per client. */
  ruleta_id?: number | null;
  /** Address of the public page of the wheel (e.g. https://pixcell.net). */
  enlace_base?: string | null;
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
  /** [placeholder, value] sent to this phone. */
  parametros: [string, string][];
}

/** The campaign with what was sent: the text of the template and its header image. */
export interface CampaignPreview extends Campaign {
  /** Text of the template with its placeholders {{1}}; null in campaigns sent before it was kept. */
  cuerpo: string | null;
  encabezado: string | null;
  pie: string | null;
  imagen_url: string | null;
}

export interface CampaignDetail {
  campaign: CampaignPreview;
  messages: CampaignMessage[];
}

/** Prize wheel of Propaganda › Ruleta, with how its links were used. */
export interface Roulette {
  id: number;
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  created_at: string;
  creado_por: string | null;
  /** Options of the wheel. */
  items: number;
  /** Links sent in campaigns. */
  enlaces: number;
  abiertos: number;
  jugados: number;
  ganadores: number;
}

export interface RouletteItem {
  id: number;
  nombre: string;
  /** False = an option without prize (e.g. "Sigue intentando"). */
  premio: boolean;
  imagen_url: string | null;
}

/** A link of the wheel sent to one phone: when it was opened, played and what was won. */
export interface RoulettePlay {
  id: number;
  cliente_id: number | null;
  cliente: string | null;
  telefono: string;
  campaign_id: number | null;
  created_at: string;
  abierto_at: string | null;
  jugado_at: string | null;
  resultado: string | null;
  gano: boolean;
}

export interface RouletteDetail {
  roulette: Roulette;
  items: RouletteItem[];
  links: RoulettePlay[];
}

/** An option being written in the "Crear" form; the image is uploaded with the wheel. */
export interface RouletteItemDraft {
  nombre: string;
  premio: boolean;
  file: File | null;
  /** Object URL of the file, for the preview. */
  url: string | null;
}

export interface RouletteRequest {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  items: { nombre: string; premio: boolean; imagen: number | null }[];
}

export type RouletteState = 'DISPONIBLE' | 'JUGADO' | 'NO_INICIADA' | 'VENCIDA';

/** The wheel as the client sees it from the link. */
export interface PublicRoulette {
  nombre: string;
  fecha_inicio: string;
  fecha_fin: string;
  items: RouletteItem[];
  estado: RouletteState;
  /** Position in `items` of the option it stopped on (once played). */
  resultado: number | null;
  gano: boolean;
}
