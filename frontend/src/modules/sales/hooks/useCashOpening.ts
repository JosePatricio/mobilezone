import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/app/store/AuthProvider';
import { useBranchOptions } from '@/modules/branches/services/branchApi';
import type { NamedRef } from '@/shared/types/api';
import { PERMISSIONS as P } from '@/shared/types/permissions';
import { SALES_KEY, saleApi } from '../services/saleApi';

export const CASH_OPENING_KEY = [SALES_KEY, 'cash-opening', 'today'];

/** Branches the user can sell from: the assigned ones, or every active branch with branches.any. */
export function useSellableBranches(enabled = true): NamedRef[] {
  const { user, hasPermission } = useAuth();
  const anyBranch = hasPermission(P.BRANCHES_ANY);
  const allBranches = useBranchOptions(anyBranch && enabled);
  return anyBranch ? (allBranches.data ?? []) : (user?.branches ?? []);
}

/** Cash opening of the logged user today (null = not opened yet). Only for users who sell. */
export function useTodayCashOpening() {
  const { hasPermission } = useAuth();
  return useQuery({
    queryKey: CASH_OPENING_KEY,
    queryFn: saleApi.todayCashOpening,
    enabled: hasPermission(P.SALES_CREATE),
  });
}
