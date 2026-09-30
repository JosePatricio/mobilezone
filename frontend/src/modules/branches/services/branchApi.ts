import { useQuery } from '@tanstack/react-query';
import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import type { NamedRef } from '@/shared/types/api';
import type { Branch, BranchRequest } from '../types';

export const BRANCHES_KEY = 'branches';

export const branchApi = {
  ...createCrudApi<Branch, BranchRequest>('/branches'),
  /** Active branches for filters/selectors (requires only inventory.view). */
  options: () => http.get<NamedRef[]>('/inventory/branches').then((r) => r.data),
};

export function useBranchOptions(enabled = true) {
  return useQuery({
    queryKey: [BRANCHES_KEY, 'options'],
    queryFn: branchApi.options,
    staleTime: 60_000,
    enabled,
  });
}
