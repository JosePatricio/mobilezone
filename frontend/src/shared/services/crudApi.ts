import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import { http } from './httpClient';

export interface CrudApi<T, TRequest> {
  list(params?: QueryParams): Promise<Page<T>>;
  get(id: Id): Promise<T>;
  create(body: TRequest): Promise<T>;
  update(id: Id, body: TRequest): Promise<T>;
  setStatus(id: Id, estado: boolean): Promise<T>;
  remove(id: Id): Promise<void>;
}

/** Standard REST client shared by every module: GET/POST/PUT/PATCH status/DELETE. */
export function createCrudApi<T, TRequest>(basePath: string): CrudApi<T, TRequest> {
  return {
    list: (params = {}) => http.get<Page<T>>(basePath, { params: cleanParams(params) }).then((r) => r.data),
    get: (id) => http.get<T>(`${basePath}/${id}`).then((r) => r.data),
    create: (body) => http.post<T>(basePath, body).then((r) => r.data),
    update: (id, body) => http.put<T>(`${basePath}/${id}`, body).then((r) => r.data),
    setStatus: (id, estado) => http.patch<T>(`${basePath}/${id}/status`, { estado }).then((r) => r.data),
    remove: (id) => http.delete(`${basePath}/${id}`).then(() => undefined),
  };
}
