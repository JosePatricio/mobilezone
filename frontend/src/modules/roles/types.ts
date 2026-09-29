import type { Permission } from '@/modules/permissions/types';
import type { Id, Timestamps } from '@/shared/types/api';

export interface Role extends Timestamps {
  id: Id;
  nombre: string;
  descripcion: string | null;
  estado: boolean;
  permissions: Permission[];
}

export interface RoleRequest {
  nombre: string;
  descripcion: string | null;
  estado: boolean;
  permission_ids?: Id[];
}
