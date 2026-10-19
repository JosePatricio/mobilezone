import type { Id, Money, NamedRef, Timestamps } from '@/shared/types/api';

export interface Product extends Timestamps {
  id: Id;
  category_id: Id;
  category: NamedRef;
  /** Proveedor; null = not assigned */
  supplier_id: Id | null;
  supplier: NamedRef | null;
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
  /** Recommended minimum of the total stock; below it the dashboard alerts (0 = no alert) */
  minimo_recomendado: number;
  /** Total stock of every branch (read-only; stock is managed per branch in Inventario) */
  stock: number;
  /** null = show the default image */
  imagen_url: string | null;
  estado: boolean;
}

/** Create / update. Stock is not part of the product: it is kept per branch (Inventario). */
export interface ProductRequest {
  category_id: Id;
  /** Proveedor (optional) */
  supplier_id: Id | null;
  sku: string;
  nombre: string;
  descripcion: string | null;
  precio_venta: Money;
  precio_costo: Money;
  precio_mayor: Money;
  /** Recommended minimum stock (0 = no alert) */
  minimo_recomendado: number;
  estado: boolean;
}
