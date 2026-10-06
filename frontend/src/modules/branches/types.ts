import type { Id, Timestamps } from '@/shared/types/api';

/** Branch (sucursal): products are stocked and sold per branch. */
export interface Branch extends Timestamps {
  id: Id;
  nombre: string;
  ubicacion: string;
  telefono: string | null;
  /** Address of the shop, printed on the work order receipt. */
  direccion: string | null;
  estado: boolean;
}

export interface BranchRequest {
  nombre: string;
  ubicacion: string;
  telefono: string | null;
  direccion: string | null;
  estado: boolean;
}
