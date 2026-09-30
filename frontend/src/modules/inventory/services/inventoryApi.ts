import { http } from '@/shared/services/httpClient';
import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import type { InventoryItem, InventoryRequest, StockAdjustmentRequest, StockMovement } from '../types';

export const INVENTORY_KEY = 'inventory';

export const inventoryApi = {
  /** `search` matches SKU or product name; `active` hides inactive products / branches. */
  list: (params: QueryParams = {}) =>
    http.get<Page<InventoryItem>>('/inventory', { params: cleanParams(params) }).then((r) => r.data),
  get: (id: Id) => http.get<InventoryItem>(`/inventory/${id}`).then((r) => r.data),
  create: (body: InventoryRequest) => http.post<InventoryItem>('/inventory', body).then((r) => r.data),
  adjustStock: (id: Id, body: StockAdjustmentRequest) =>
    http.patch<InventoryItem>(`/inventory/${id}/stock`, body).then((r) => r.data),
  movements: (id: Id, page = 1) =>
    http.get<Page<StockMovement>>(`/inventory/${id}/movements`, { params: { page, size: 10 } }).then((r) => r.data),
  remove: (id: Id) => http.delete(`/inventory/${id}`).then(() => undefined),
};
