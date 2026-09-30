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
  /** Total stock of every branch (read-only; stock is managed per branch in Inventario) */
  stock: number;
  /** null = show the default image */
  imagen_url: string | null;
  estado: boolean;
}

/** Create / update. Stock is not part of the product: it is kept per branch (Inventario). */
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
