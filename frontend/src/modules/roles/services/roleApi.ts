import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import type { Id } from '@/shared/types/api';
import type { Role, RoleRequest } from '../types';

export const ROLES_KEY = 'roles';

export const roleApi = {
  ...createCrudApi<Role, RoleRequest>('/roles'),
  setPermissions: (id: Id, permissionIds: Id[]) =>
    http.put<Role>(`/roles/${id}/permissions`, { permission_ids: permissionIds }).then((r) => r.data),
  addPermission: (id: Id, permissionId: Id) =>
    http.post<Role>(`/roles/${id}/permissions/${permissionId}`).then((r) => r.data),
  removePermission: (id: Id, permissionId: Id) =>
    http.delete<Role>(`/roles/${id}/permissions/${permissionId}`).then((r) => r.data),
};
