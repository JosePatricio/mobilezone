import type { Id, Money, NamedRef, Timestamps } from '@/shared/types/api';

export interface Product extends Timestamps {
  id: Id;
  category_id: Id;
  category: NamedRef;
  nombre: string;
  descripcion: string | null;
  precio: Money;
  stock: number;
  estado: boolean;
}

export interface CreateProductRequest {
  category_id: Id;
  nombre: string;
  descripcion: string | null;
  precio: Money;
  stock: number;
  estado: boolean;
}

/** Stock is not editable here: it changes through sales and audited adjustments. */
export type UpdateProductRequest = Omit<CreateProductRequest, 'stock'>;

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
