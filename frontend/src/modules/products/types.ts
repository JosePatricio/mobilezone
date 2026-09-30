import type { Id, Money, NamedRef, Timestamps } from '@/shared/types/api';

export interface Product extends Timestamps {
  id: Id;
  category_id: Id;
  category: NamedRef;
  /** Product code */
  sku: string;
  nombre: string;
  descripcion: string | null;
  /** PVP: the price used in sales */
  precio_venta: Money;
  /** Acquisition cost */
  precio_costo: Money;
  /** Wholesale price */
  precio_mayor: Money;
  stock: number;
  /** null = show the default image */
  imagen_url: string | null;
  estado: boolean;
}

/** Create / update. There is no stock field: new products start at 0 and stock
 *  changes only through sales and audited adjustments. */
export interface ProductRequest {
  category_id: Id;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precio_venta: Money;
  precio_costo: Money;
  precio_mayor: Money;
  estado: boolean;
}

export interface ProductStock {
  product_id: Id;
  nombre: string;
  stock: number;
  estado: boolean;
}

export interface StockAdjustmentRequest {
  cantidad: number;
  motivo: string | null;
}

export interface StockMovement {
  id: Id;
  product_id: Id;
  tipo: 'VENTA' | 'ANULACION_VENTA' | 'AJUSTE';
  cantidad: number;
  stock_resultante: number;
  user_id: Id | null;
  referencia: string | null;
  motivo: string | null;
  fecha: string;
}
