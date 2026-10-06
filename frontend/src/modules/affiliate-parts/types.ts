import type { Id, Money, Timestamps } from '@/shared/types/api';

export type AffiliatePartType =
  | 'CAMARAS'
  | 'PLACA_PRINCIPAL'
  | 'BATERIA'
  | 'PLACA_CARGA'
  | 'ANTENAS'
  | 'CRISTAL_CAMARA'
  | 'TAPAS'
  | 'DISPLAY'
  | 'BACK_COVER';
/** Nuevo / Usado */
export type PartCondition = 'NUEVO' | 'USADO';
/** Disponible / Vendido */
export type AffiliatePartStatus = 'DISPONIBLE' | 'VENDIDO';

/** Public contact data of the affiliate, taken from their user. */
export interface Affiliate {
  id: Id;
  nombre: string;
  apellido: string;
  celular: string | null;
  direccion: string | null;
  provincia: string | null;
  ciudad: string | null;
}

export interface AffiliatePart extends Timestamps {
  id: Id;
  tipo: AffiliatePartType;
  tipo_label: string;
  condicion: PartCondition;
  condicion_label: string;
  garantia: boolean;
  estado: AffiliatePartStatus;
  estado_label: string;
  descripcion: string | null;
  precio: Money | null;
  afiliado: Affiliate;
}

export interface AffiliatePartRequest {
  tipo: AffiliatePartType;
  condicion: PartCondition;
  garantia: boolean;
  estado: AffiliatePartStatus;
  descripcion: string | null;
  precio: Money | null;
}

export interface CatalogOption<V extends string = string> {
  value: V;
  label: string;
}

export interface AffiliatePartCatalogs {
  tipos: CatalogOption<AffiliatePartType>[];
  condiciones: CatalogOption<PartCondition>[];
  estados: CatalogOption<AffiliatePartStatus>[];
}
