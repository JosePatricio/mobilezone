import { useQuery } from '@tanstack/react-query';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import type { WorkOrderStatusOption } from '../types';

/** Fallback used until the API answers. Labels come from the backend (single source of truth). */
const FALLBACK: WorkOrderStatusOption[] = [0, 1, 2].map((value) => ({ value, label: `Estado ${value}` }));

export function useWorkOrderStatuses() {
  const query = useQuery({
    queryKey: [WORK_ORDERS_KEY, 'statuses'],
    queryFn: workOrderApi.statuses,
    staleTime: Infinity,
  });
  const statuses = query.data ?? FALLBACK;
  return {
    statuses,
    label: (value: number) => statuses.find((s) => s.value === value)?.label ?? `Estado ${value}`,
  };
}

const TONES = ['info', 'warning', 'success'] as const;
export function statusTone(value: number): (typeof TONES)[number] {
  return TONES[value] ?? 'info';
}
