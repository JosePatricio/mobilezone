import type { Client, ClientRequest } from '@/modules/clients/types';
import { http } from '@/shared/services/httpClient';
import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import type { CreateSaleRequest, Sale, UpdateSaleRequest } from '../types';

export const SALES_KEY = 'sales';

export const saleApi = {
  list: (params: QueryParams = {}) => http.get<Page<Sale>>('/sales', { params: cleanParams(params) }).then((r) => r.data),
  get: (id: Id) => http.get<Sale>(`/sales/${id}`).then((r) => r.data),
  /** Confirms the sale. The backend validates stock again inside a transaction. */
  confirm: (body: CreateSaleRequest) => http.post<Sale>('/sales', body).then((r) => r.data),
  /** Modifies a confirmed sale (returns / changes). The backend reconciles the stock. */
  update: (id: Id, body: UpdateSaleRequest) => http.put<Sale>(`/sales/${id}`, body).then((r) => r.data),
  /** "Eliminar": the sale is cancelled (kept as ANULADA) and the stock goes back to the branch. */
  cancel: (id: Id) => http.post<Sale>(`/sales/${id}/cancel`).then((r) => r.data),
  /** PDF receipt (comprobante). */
  receipt: (id: Id) => http.get<Blob>(`/sales/${id}/receipt`, { responseType: 'blob' }).then((r) => r.data),
  /** Finds an active client by cédula / RUC (available to sellers). */
  lookupCustomer: (identificacion: string) =>
    http.get<Client>('/sales/customers/lookup', { params: { identificacion } }).then((r) => r.data),
  /** Registers a new client (role CLIENTE, no password) from the sales screen. */
  createCustomer: (body: ClientRequest) => http.post<Client>('/sales/customers', body).then((r) => r.data),
};
