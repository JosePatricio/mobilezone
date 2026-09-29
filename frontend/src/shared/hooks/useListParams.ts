import { useMemo, useState } from 'react';
import type { QueryParams } from '@/shared/types/api';
import { useDebounce } from './useDebounce';

/**
 * UI state for list screens: pagination, search and filters.
 * Changing the search or a filter resets the page to 1.
 */
export function useListParams<F extends QueryParams>(initialFilters: F, pageSize = 20) {
  const [page, setPage] = useState(1);
  const [search, setSearchState] = useState('');
  const [filters, setFiltersState] = useState<F>(initialFilters);
  const debouncedSearch = useDebounce(search);

  const params = useMemo<QueryParams>(
    () => ({ page, size: pageSize, search: debouncedSearch.trim(), ...filters }),
    [page, pageSize, debouncedSearch, filters],
  );

  return {
    page,
    setPage,
    search,
    setSearch: (value: string) => {
      setSearchState(value);
      setPage(1);
    },
    filters,
    setFilter: <K extends keyof F>(key: K, value: F[K]) => {
      setFiltersState((prev) => ({ ...prev, [key]: value }));
      setPage(1);
    },
    resetFilters: () => {
      setFiltersState(initialFilters);
      setSearchState('');
      setPage(1);
    },
    params,
  };
}
