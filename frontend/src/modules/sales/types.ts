import type { Id, Money, Timestamps, UserRef } from '@/shared/types/api';

export type SaleStatus = 'CONFIRMADA' | 'ANULADA';

export interface SaleDetail {
  id: Id;
  product_id: Id;
  product: { id: Id; sku: string; nombre: string; imagen_url: string | null };
  cantidad: number;
  precio_unitario: Money;
  subtotal: Money;
}

export interface SaleCustomer {
  id: Id;
  nombre: string;
  apellido: string;
  identificacion: string | null;
}

export interface Sale extends Timestamps {
  id: Id;
  user_id: Id;
  user: UserRef;
  fecha: string;
  total: Money;
  estado: SaleStatus;
  /** true = factura, false = comprobante de venta */
  factura: boolean;
  cliente_id: Id | null;
  /** null = consumidor final */
  cliente: SaleCustomer | null;
  details: SaleDetail[];
}

export interface SaleItemRequest {
  product_id: Id;
  cantidad: number;
}

export interface CreateSaleRequest {
  items: SaleItemRequest[];
  factura: boolean;
  /** null = consumidor final */
  cliente_id: Id | null;
}

export const CONSUMIDOR_FINAL = 'Consumidor final';

export function documentLabel(factura: boolean): string {
  return factura ? 'Factura' : 'Comprobante';
}

export function customerLabel(cliente: Pick<SaleCustomer, 'nombre' | 'apellido'> | null): string {
  return cliente ? `${cliente.nombre} ${cliente.apellido}` : CONSUMIDOR_FINAL;
}
