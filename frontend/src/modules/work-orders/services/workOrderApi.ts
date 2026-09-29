import { http } from '@/shared/services/httpClient';
import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import type {
  AddSparePartRequest,
  WorkOrder,
  WorkOrderListItem,
  WorkOrderRequest,
  WorkOrderSparePart,
  WorkOrderStatusOption,
} from '../types';

export const WORK_ORDERS_KEY = 'work-orders';
const BASE = '/work-orders';

export const workOrderApi = {
  list: (params: QueryParams = {}) =>
    http.get<Page<WorkOrderListItem>>(BASE, { params: cleanParams(params) }).then((r) => r.data),
  get: (id: Id) => http.get<WorkOrder>(`${BASE}/${id}`).then((r) => r.data),
  getByNumber: (num: number) => http.get<WorkOrder>(`${BASE}/by-number/${num}`).then((r) => r.data),
  create: (body: WorkOrderRequest) => http.post<WorkOrder>(BASE, body).then((r) => r.data),
  update: (id: Id, body: WorkOrderRequest) => http.put<WorkOrder>(`${BASE}/${id}`, body).then((r) => r.data),
  setStatus: (id: Id, estado: number) => http.patch<WorkOrder>(`${BASE}/${id}/status`, { estado }).then((r) => r.data),
  statuses: () => http.get<WorkOrderStatusOption[]>(`${BASE}/statuses`).then((r) => r.data),
  addSparePart: (id: Id, body: AddSparePartRequest) =>
    http.post<WorkOrderSparePart>(`${BASE}/${id}/spare-parts`, body).then((r) => r.data),
  removeSparePart: (id: Id, itemId: Id) => http.delete(`${BASE}/${id}/spare-parts/${itemId}`).then(() => undefined),
};
