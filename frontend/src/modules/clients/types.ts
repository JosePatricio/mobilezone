import type { Id, Timestamps } from '@/shared/types/api';

/** Clients are users with the CLIENTE role (same users table). */
export interface Client extends Timestamps {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
  /** Cédula (10 digits) or RUC (13 digits) */
  identificacion: string | null;
  celular: string | null;
  provincia: string | null;
  ciudad: string | null;
  /** null = show the default avatar */
  foto_url: string | null;
  estado: boolean;
}

export interface ClientRequest {
  nombre: string;
  apellido: string;
  email: string;
  identificacion: string;
  celular: string | null;
  provincia: string | null;
  ciudad: string | null;
  estado: boolean;
}

export type ClientRef = Pick<Client, 'id' | 'nombre' | 'apellido' | 'identificacion'> & Partial<Pick<Client, 'email'>>;
