import type { Id, Timestamps } from '@/shared/types/api';

/** Supplier (proveedor) of the products. */
export interface Supplier extends Timestamps {
  id: Id;
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado: boolean;
}

export interface SupplierRequest {
  nombre: string;
  ruc: string | null;
  telefono: string | null;
  email: string | null;
  direccion: string | null;
  estado: boolean;
}
