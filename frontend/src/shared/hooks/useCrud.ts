import { keepPreviousData, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CrudApi } from '@/shared/services/crudApi';
import type { Id, QueryParams } from '@/shared/types/api';

/** Server-state hooks shared by the CRUD modules (TanStack Query). */
export function useCrudList<T, R>(key: string, api: CrudApi<T, R>, params: QueryParams, enabled = true) {
  return useQuery({
    queryKey: [key, 'list', params],
    queryFn: () => api.list(params),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export function useCrudItem<T, R>(key: string, api: CrudApi<T, R>, id: Id | undefined) {
  return useQuery({
    queryKey: [key, 'detail', id],
    queryFn: () => api.get(id as Id),
    enabled: id !== undefined && !Number.isNaN(id),
  });
}

export function useCrudMutations<T, R>(key: string, api: CrudApi<T, R>) {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: [key] });

  const create = useMutation({ mutationFn: (body: R) => api.create(body), onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, body }: { id: Id; body: R }) => api.update(id, body),
    onSuccess: invalidate,
  });
  const setStatus = useMutation({
    mutationFn: ({ id, estado }: { id: Id; estado: boolean }) => api.setStatus(id, estado),
    onSuccess: invalidate,
  });
  const remove = useMutation({ mutationFn: (id: Id) => api.remove(id), onSuccess: invalidate });

  return { create, update, setStatus, remove };
}

/** Loads every active option of a catalog for selects (up to 100). */
export function useOptions<T, R>(key: string, api: CrudApi<T, R>, params: QueryParams = {}, enabled = true) {
  return useQuery({
    queryKey: [key, 'options', params],
    queryFn: () => api.list({ size: 100, estado: true, ...params }).then((page) => page.items),
    staleTime: 60_000,
    enabled,
  });
}
