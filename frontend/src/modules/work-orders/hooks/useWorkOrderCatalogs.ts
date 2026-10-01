import { useQuery } from '@tanstack/react-query';
import { WORK_ORDERS_KEY, workOrderApi } from '../services/workOrderApi';
import type { CatalogOption, WorkOrderCatalogs } from '../types';

const EMPTY: WorkOrderCatalogs = {
  motivos_ingreso: [],
  tipos_display: [],
  tipos_garantia: [],
  tipos_bloqueo: [
    { value: 'NINGUNO', label: 'Sin bloqueo' },
    { value: 'PATRON', label: 'Patrón' },
    { value: 'PIN', label: 'PIN' },
  ],
  estados: [],
};

/** Options of the order form; labels come from the backend (single source of truth). */
export function useWorkOrderCatalogs() {
  const query = useQuery({ queryKey: [WORK_ORDERS_KEY, 'catalogs'], queryFn: workOrderApi.catalogs, staleTime: Infinity });
  const catalogs = query.data ?? EMPTY;
  const labelOf = (options: CatalogOption[], value: string | null | undefined) =>
    options.find((o) => o.value === value)?.label ?? value ?? '—';
  return { catalogs, labelOf, isLoading: query.isLoading };
}
