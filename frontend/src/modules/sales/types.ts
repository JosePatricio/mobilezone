import type { Id, Money, NamedRef, Timestamps, UserRef } from '@/shared/types/api';

export type SaleStatus = 'CONFIRMADA' | 'ANULADA';

export interface SaleDetail {
  id: Id;
  product_id: Id;
  product: NamedRef;
  cantidad: number;
  precio_unitario: Money;
  subtotal: Money;
}

export interface Sale extends Timestamps {
  id: Id;
  user_id: Id;
  user: UserRef;
  fecha: string;
  total: Money;
  estado: SaleStatus;
  details: SaleDetail[];
}

export interface SaleItemRequest {
  product_id: Id;
  cantidad: number;
}

export interface CreateSaleRequest {
  items: SaleItemRequest[];
}
