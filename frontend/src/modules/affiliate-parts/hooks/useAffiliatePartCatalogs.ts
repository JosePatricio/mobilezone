import { useQuery } from '@tanstack/react-query';
import type { SelectOption } from '@/shared/components';
import { AFFILIATE_PARTS_KEY, affiliatePartApi } from '../services/affiliatePartApi';
import type { AffiliatePartStatus } from '../types';

/** Types, conditions and statuses (labels come from the backend). */
export function useAffiliatePartCatalogs() {
  const query = useQuery({
    queryKey: [AFFILIATE_PARTS_KEY, 'catalogs'],
    queryFn: affiliatePartApi.catalogs,
    staleTime: Infinity,
  });
  const toOptions = (items: { value: string; label: string }[] = []): SelectOption[] =>
    items.map((o) => ({ value: o.value, label: o.label }));
  return {
    ...query,
    tipos: toOptions(query.data?.tipos),
    condiciones: toOptions(query.data?.condiciones),
    estados: toOptions(query.data?.estados),
  };
}

export const partStatusTone = (estado: AffiliatePartStatus) => (estado === 'DISPONIBLE' ? 'success' : 'neutral');

export const yesNo = (value: boolean) => (value ? 'Sí' : 'No');
