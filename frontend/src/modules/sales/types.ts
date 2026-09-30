import type { Id, Money, NamedRef, Timestamps, UserRef } from '@/shared/types/api';

export type SaleStatus = 'CONFIRMADA' | 'ANULADA';

export interface SaleDetail {
  id: Id;
  product_id: Id;
  product: { id: Id; sku: string; nombre: string; imagen_url: string | null };
  /** Inventory (product + branch) the units were taken from */
  inventory_id: Id;
  cantidad: number;
  precio_unitario: Money;
  subtotal: Money;
}

export interface SaleCustomer {
  id: Id;
  nombre: string;
  apellido: string;
  identificacion: string | null;
  celular: string | null;
}

export interface Sale extends Timestamps {
  id: Id;
  user_id: Id;
  user: UserRef;
  branch_id: Id;
  branch: NamedRef;
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
  inventory_id: Id;
  cantidad: number;
}

export interface CreateSaleRequest {
  branch_id: Id;
  items: SaleItemRequest[];
  factura: boolean;
  /** null = consumidor final */
  cliente_id: Id | null;
}

export const CONSUMIDOR_FINAL = 'Consumidor final';

export function documentLabel(factura: boolean): string {
  return factura ? 'Factura' : 'Comprobante';
}

/** "Nombre Apellido" or "Consumidor final". */
export function customerName(cliente: Pick<SaleCustomer, 'nombre' | 'apellido'> | null): string {
  return cliente ? `${cliente.nombre} ${cliente.apellido}` : CONSUMIDOR_FINAL;
}

/** "Nombre Apellido, cédula/RUC, celular" (missing values are skipped) or "Consumidor final". */
export function customerLabel(cliente: SaleCustomer | null): string {
  if (!cliente) return CONSUMIDOR_FINAL;
  return [customerName(cliente), cliente.identificacion, cliente.celular].filter(Boolean).join(', ');
}
