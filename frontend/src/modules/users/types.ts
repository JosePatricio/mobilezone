import type { Id, NamedRef, Timestamps } from '@/shared/types/api';

/** System roles. The role is the only "type" of a user (clients have the CLIENTE role). */
export const SYSTEM_ROLES = {
  ADMIN: 'ADMIN',
  VENDEDOR: 'VENDEDOR',
  TECNICO: 'TECNICO',
  CLIENTE: 'CLIENTE',
} as const;

export interface User extends Timestamps {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
  identificacion: string | null;
  celular: string | null;
  ciudad: string | null;
  /** null = show the default avatar */
  foto_url: string | null;
  rol_id: Id;
  role: NamedRef;
  estado: boolean;
}

export interface UserRequest {
  nombre: string;
  apellido: string;
  email: string;
  password?: string | null;
  rol_id: Id;
  identificacion: string | null;
  celular: string | null;
  ciudad: string | null;
  estado: boolean;
}

export function hasRole(user: { role?: NamedRef | null } | null | undefined, role: string): boolean {
  return user?.role?.nombre === role;
}
