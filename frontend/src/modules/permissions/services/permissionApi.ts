import { useQuery } from '@tanstack/react-query';
import { http } from '@/shared/services/httpClient';
import type { Permission } from '../types';

export const PERMISSIONS_KEY = 'permissions';

export const permissionApi = {
  list: () => http.get<Permission[]>('/permissions').then((r) => r.data),
};

export function usePermissionsCatalog() {
  return useQuery({ queryKey: [PERMISSIONS_KEY], queryFn: permissionApi.list, staleTime: 5 * 60_000 });
}
