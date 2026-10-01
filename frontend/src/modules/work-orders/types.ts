import type { Id, Money, NamedRef, Timestamps, UserRef } from '@/shared/types/api';

export interface WorkOrderStatusOption {
  value: number;
  label: string;
}

export interface CatalogOption {
  value: string;
  label: string;
}

/** Options of the order form (GET /work-orders/catalogs); labels come from the backend. */
export interface WorkOrderCatalogs {
  motivos_ingreso: CatalogOption[];
  tipos_display: CatalogOption[];
  tipos_garantia: CatalogOption[];
  tipos_bloqueo: CatalogOption[];
  estados: WorkOrderStatusOption[];
}

export const DISPLAY_CHANGE = 'CAMBIO_DISPLAY';
export type LockType = 'NINGUNO' | 'PATRON' | 'PIN';

export interface WorkOrderClient {
  id: Id;
  nombre: string;
  apellido: string;
  identificacion: string | null;
  celular: string | null;
}

export interface WorkOrderListItem {
  id: Id;
  num_orden: number;
  user_id: Id;
  cliente_id: Id;
  cliente: WorkOrderClient;
  tecnico_id: Id | null;
  tecnico: UserRef | null;
  marca_id: Id;
  marca: NamedRef;
  modelo_id: Id;
  modelo: NamedRef;
  estado: number;
  estado_label: string;
  motivo_ingreso: string;
  motivo_ingreso_label: string;
  tipo_display: string | null;
  tipo_garantia: string;
  tipo_garantia_label: string;
  color: string | null;
  /** Costo de reparación */
  presupuesto: Money;
  anticipo: Money;
  saldo: Money;
  fecha: string;
}

export interface WorkOrderSparePart {
  id: Id;
  work_order_id: Id;
  spare_part_id: Id;
  spare_part: { id: Id; tipo: string };
  technician_id: Id;
  technician: UserRef;
  cantidad: number;
  precio: Money;
  subtotal: Money;
  fecha: string;
}

export interface WorkOrderPhoto {
  id: Id;
  url: string;
  created_at: string | null;
}

export interface WorkOrder extends WorkOrderListItem, Timestamps {
  /** User who registered the order. */
  user: UserRef;
  observacion: string | null;
  bloqueo_tipo: LockType;
  /** Pattern as dots 1..9 ("1-5-9-6") or numeric PIN. */
  bloqueo_valor: string | null;
  /** Code of the public status page (QR). */
  codigo_publico: string;
  photos: WorkOrderPhoto[];
  spare_parts: WorkOrderSparePart[];
  spare_parts_total: Money;
}

/** `user_id` comes from the session and `saldo` is computed by the backend. */
export interface WorkOrderRequest {
  /** Found by cédula / RUC; registered as a client when it does not exist. */
  cliente: { identificacion: string; nombre: string; apellido: string; celular: string | null };
  tecnico_id: Id | null;
  marca_id: Id;
  modelo_id: Id;
  color: string | null;
  motivo_ingreso: string;
  tipo_display: string | null;
  tipo_garantia: string;
  bloqueo_tipo: LockType;
  bloqueo_valor: string | null;
  observacion: string | null;
  estado: number;
  presupuesto: Money;
  anticipo: Money;
  fecha: string | null;
}

/** Public status page (QR): no client data and no unlock code. */
export interface PublicWorkOrder {
  num_orden: number;
  fecha: string;
  estado: number;
  estado_label: string;
  marca: NamedRef;
  modelo: NamedRef;
  color: string | null;
  motivo_ingreso: string;
  motivo_ingreso_label: string;
  tipo_display: string | null;
  presupuesto: Money;
  anticipo: Money;
  saldo: Money;
  updated_at: string;
}

export interface AddSparePartRequest {
  spare_part_id: Id;
  cantidad: number;
  precio: Money | null;
}
