import type { Id, Timestamps } from '@/shared/types/api';

/** Clients are users of type CLIENTE (same users table). */
export interface Client extends Timestamps {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
  estado: boolean;
}

export interface ClientRequest {
  nombre: string;
  apellido: string;
  email: string;
  estado: boolean;
}
