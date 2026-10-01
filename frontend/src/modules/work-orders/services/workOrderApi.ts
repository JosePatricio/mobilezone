import type { Client, ClientRequest } from '@/modules/clients/types';
import { http } from '@/shared/services/httpClient';
import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import type {
  AddSparePartRequest,
  PublicWorkOrder,
  WorkOrder,
  WorkOrderCatalogs,
  WorkOrderClient,
  WorkOrderListItem,
  WorkOrderPhoto,
  WorkOrderRequest,
  WorkOrderSparePart,
  WorkOrderStatusOption,
} from '../types';

export const WORK_ORDERS_KEY = 'work-orders';
const BASE = '/work-orders';

export const workOrderApi = {
  /** `cliente` filters by client name, email or cédula. */
  list: (params: QueryParams = {}) =>
    http.get<Page<WorkOrderListItem>>(BASE, { params: cleanParams(params) }).then((r) => r.data),
  get: (id: Id) => http.get<WorkOrder>(`${BASE}/${id}`).then((r) => r.data),
  getByNumber: (num: number) => http.get<WorkOrder>(`${BASE}/by-number/${num}`).then((r) => r.data),
  create: (body: WorkOrderRequest) => http.post<WorkOrder>(BASE, body).then((r) => r.data),
  update: (id: Id, body: WorkOrderRequest) => http.put<WorkOrder>(`${BASE}/${id}`, body).then((r) => r.data),
  setStatus: (id: Id, estado: number) => http.patch<WorkOrder>(`${BASE}/${id}/status`, { estado }).then((r) => r.data),
  statuses: () => http.get<WorkOrderStatusOption[]>(`${BASE}/statuses`).then((r) => r.data),
  catalogs: () => http.get<WorkOrderCatalogs>(`${BASE}/catalogs`).then((r) => r.data),
  /** Client by cédula / RUC (404 = new client). */
  lookupCustomer: (identificacion: string) =>
    http.get<WorkOrderClient>(`${BASE}/customers/lookup`, { params: { identificacion } }).then((r) => r.data),
  /** Registers a new client (role CLIENTE) from the order screen. */
  createCustomer: (body: ClientRequest) => http.post<Client>(`${BASE}/customers`, body).then((r) => r.data),
  addPhoto: (id: Id, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return http
      .post<WorkOrderPhoto>(`${BASE}/${id}/photos`, form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },
  removePhoto: (id: Id, photoId: Id) => http.delete(`${BASE}/${id}/photos/${photoId}`).then(() => undefined),
  addSparePart: (id: Id, body: AddSparePartRequest) =>
    http.post<WorkOrderSparePart>(`${BASE}/${id}/spare-parts`, body).then((r) => r.data),
  removeSparePart: (id: Id, itemId: Id) => http.delete(`${BASE}/${id}/spare-parts/${itemId}`).then(() => undefined),
  /** Public status page opened from the QR (no session needed). */
  publicStatus: (codigo: string) =>
    http.get<PublicWorkOrder>(`/public/work-orders/${encodeURIComponent(codigo)}`).then((r) => r.data),
};
