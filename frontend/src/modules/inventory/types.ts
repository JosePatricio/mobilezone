import type { Id, Money, NamedRef } from '@/shared/types/api';

/** Stock of a product in a branch. Its `id` is the inventory id used in sales. */
export interface InventoryItem {
  id: Id;
  product_id: Id;
  product: {
    id: Id;
    sku: string;
    nombre: string;
    precio_venta: Money;
    imagen_url: string | null;
    estado: boolean;
  };
  branch_id: Id;
  branch: NamedRef;
  stock: number;
  updated_at: string;
}

export interface InventoryRequest {
  product_id: Id;
  branch_id: Id;
  stock: number;
}

export interface StockAdjustmentRequest {
  cantidad: number;
  motivo: string | null;
}

export interface StockMovement {
  id: Id;
  product_id: Id;
  inventory_id: Id | null;
  tipo: 'VENTA' | 'ANULACION_VENTA' | 'AJUSTE';
  cantidad: number;
  stock_resultante: number;
  user_id: Id | null;
  referencia: string | null;
  motivo: string | null;
  fecha: string;
}
