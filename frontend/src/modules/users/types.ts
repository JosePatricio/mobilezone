import type { Id, NamedRef, Timestamps } from '@/shared/types/api';

export type UserType = 'ADMIN' | 'USUARIO' | 'TECNICO' | 'CLIENTE';

export const USER_TYPE_LABELS: Record<UserType, string> = {
  ADMIN: 'Administrador',
  USUARIO: 'Usuario',
  TECNICO: 'Técnico',
  CLIENTE: 'Cliente',
};

export interface User extends Timestamps {
  id: Id;
  nombre: string;
  apellido: string;
  email: string;
  tipo_usuario: UserType;
  rol_id: Id | null;
  role: NamedRef | null;
  estado: boolean;
}

export interface UserRequest {
  nombre: string;
  apellido: string;
  email: string;
  password?: string | null;
  tipo_usuario: UserType;
  rol_id: Id | null;
  estado: boolean;
}
