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
  tipos_bloqueo: CatalogOption[];
  estados: WorkOrderStatusOption[];
}

export const DISPLAY_CHANGE = 'CAMBIO_DISPLAY';

/** Order statuses (labels come from the backend). FINALIZADO closes the order and registers a sale. */
export const WORK_ORDER_STATUS = { RECIBIDO: 0, EN_PROCESO: 1, FINALIZADO: 2 } as const;
export type LockType = 'NINGUNO' | 'PATRON' | 'PIN';

export interface WorkOrderClient {
  id: Id;
  nombre: string;
  apellido: string;
  identificacion: string | null;
  celular: string | null;
  email?: string | null;
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
  /** Tiempo de garantía in days (0 = sin garantía). */
  garantia_dias: number;
  color: string | null;
  /** Costo de reparación */
  presupuesto: Money;
  anticipo: Money;
  saldo: Money;
  /** Reception date (local day of fecha_hora). */
  fecha: string;
  /** Reception date and time (ISO 8601). */
  fecha_hora: string;
  /** Promised delivery date and time (ISO 8601). */
  fecha_entrega: string | null;
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

export interface WorkOrderStatusChange {
  id: Id;
  estado: number;
  estado_label: string;
  observacion: string | null;
  /** Approximate delivery time given when it went En proceso. */
  fecha_entrega: string | null;
  user: UserRef;
  created_at: string;
}

export interface WorkOrderSale {
  id: Id;
  fecha: string;
  total: Money;
  total_pagar: Money;
  metodo_pago: string | null;
}

/** Shop (sucursal) of the order: its contact data is printed on the receipt. */
export interface WorkOrderBranch {
  id: Id;
  nombre: string;
  ubicacion: string;
  direccion: string | null;
  telefono: string | null;
}

export interface WorkOrder extends WorkOrderListItem, Timestamps {
  /** User who registered the order. */
  user: UserRef;
  branch_id: Id | null;
  branch: WorkOrderBranch | null;
  observacion: string | null;
  /** Technical model code of the phone, e.g. SM-A105M. */
  modelo_tecnico: string | null;
  bloqueo_tipo: LockType;
  /** Pattern as dots 1..9 ("1-5-9-6") or numeric PIN. */
  bloqueo_valor: string | null;
  /** Code of the public status page (QR). */
  codigo_publico: string;
  photos: WorkOrderPhoto[];
  /** Status history (oldest first). */
  status_changes: WorkOrderStatusChange[];
  /** Sale registered when the order was finalized. */
  sale: WorkOrderSale | null;
  spare_parts: WorkOrderSparePart[];
  spare_parts_total: Money;
}

/**
 * `user_id` and the technician are the logged user, the date is today and `saldo`
 * is computed by the backend.
 */
export interface WorkOrderRequest {
  /** Found by cédula / RUC; registered as a client when it does not exist. */
  /** The email is saved in the client only when it has none. */
  cliente: { identificacion: string; nombre: string; apellido: string; celular: string | null; email: string | null };
  marca_id: Id;
  modelo_id: Id;
  color: string | null;
  modelo_tecnico: string | null;
  motivo_ingreso: string;
  tipo_display: string | null;
  garantia_dias: number;
  bloqueo_tipo: LockType;
  bloqueo_valor: string | null;
  observacion: string | null;
  presupuesto: Money;
  anticipo: Money;
  /** ISO 8601 */
  fecha_entrega: string | null;
  /** Sucursal (local) that receives the device; null = the user's branch. */
  branch_id: Id | null;
  /** Reception date and time (ISO 8601); defaults to now in the form. */
  fecha_hora: string | null;
}

/** Public status page (QR): no client data and no unlock code. */
export interface PublicWorkOrder {
  num_orden: number;
  fecha: string;
  fecha_hora: string;
  estado: number;
  estado_label: string;
  marca: NamedRef;
  modelo: NamedRef;
  color: string | null;
  motivo_ingreso: string;
  motivo_ingreso_label: string;
  tipo_display: string | null;
  garantia_dias: number;
  presupuesto: Money;
  anticipo: Money;
  saldo: Money;
  fecha_entrega: string | null;
  updated_at: string;
}

/** Recibido / En proceso (`fecha_entrega` required for En proceso). */
export interface WorkOrderStatusRequest {
  estado: number;
  fecha_entrega?: string | null;
  observacion?: string | null;
}

/** Finalizado: closes the order and registers the sale (payment of the saldo). */
export interface FinalizeWorkOrderRequest {
  branch_id: Id;
  metodo_pago: 'EFECTIVO' | 'TRANSFERENCIA' | 'TARJETA';
  monto_recibido: Money | null;
  observacion?: string | null;
}

export interface AddSparePartRequest {
  spare_part_id: Id;
  cantidad: number;
  precio: Money | null;
}
