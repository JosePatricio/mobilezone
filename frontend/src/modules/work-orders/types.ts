import type { Id, Money, NamedRef, Timestamps, UserRef } from '@/shared/types/api';

export interface WorkOrderStatusOption {
  value: number;
  label: string;
}

export interface WorkOrderListItem {
  id: Id;
  num_orden: number;
  user_id: Id;
  cliente_id: Id;
  cliente: UserRef;
  tecnico_id: Id | null;
  tecnico: UserRef | null;
  marca_id: Id;
  marca: NamedRef;
  modelo_id: Id;
  modelo: NamedRef;
  estado: number;
  estado_label: string;
  garantia: boolean;
  color: string | null;
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

export interface WorkOrder extends WorkOrderListItem, Timestamps {
  user: UserRef;
  observacion: string | null;
  spare_parts: WorkOrderSparePart[];
  spare_parts_total: Money;
}

/** `user_id` comes from the session and `saldo` is computed by the backend. */
export interface WorkOrderRequest {
  cliente_id: Id;
  tecnico_id: Id | null;
  marca_id: Id;
  modelo_id: Id;
  observacion: string | null;
  estado: number;
  garantia: boolean;
  color: string | null;
  presupuesto: Money;
  anticipo: Money;
  fecha: string | null;
}

export interface AddSparePartRequest {
  spare_part_id: Id;
  cantidad: number;
  precio: Money | null;
}
