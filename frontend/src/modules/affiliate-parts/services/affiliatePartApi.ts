import { http } from '@/shared/services/httpClient';
import type { Id, Page, QueryParams } from '@/shared/types/api';
import { cleanParams } from '@/shared/utils/format';
import type { AffiliatePart, AffiliatePartCatalogs, AffiliatePartRequest, AffiliatePartStatus } from '../types';

export const AFFILIATE_PARTS_KEY = 'affiliate-parts';
const BASE = '/affiliate-parts';
const PUBLIC = '/public/affiliate-parts';

export const affiliatePartApi = {
  /** Parts of the logged affiliate (every affiliate with affiliate_parts.any; filter `user_id`). */
  list: (params: QueryParams = {}) =>
    http.get<Page<AffiliatePart>>(BASE, { params: cleanParams(params) }).then((r) => r.data),
  create: (body: AffiliatePartRequest) => http.post<AffiliatePart>(BASE, body).then((r) => r.data),
  update: (id: Id, body: AffiliatePartRequest) => http.put<AffiliatePart>(`${BASE}/${id}`, body).then((r) => r.data),
  setStatus: (id: Id, estado: AffiliatePartStatus) =>
    http.patch<AffiliatePart>(`${BASE}/${id}/status`, { estado }).then((r) => r.data),
  remove: (id: Id) => http.delete(`${BASE}/${id}`).then(() => undefined),
  /** Visits of the public catalog. */
  visits: () => http.get<{ visitas: number }>(`${BASE}/visits`).then((r) => r.data.visitas),

  // Public (no login)
  catalogs: () => http.get<AffiliatePartCatalogs>(`${PUBLIC}/catalogs`).then((r) => r.data),
  publicList: (params: QueryParams = {}) =>
    http.get<Page<AffiliatePart>>(PUBLIC, { params: cleanParams(params) }).then((r) => r.data),
  registerVisit: () => http.post<{ visitas: number }>(`${PUBLIC}/visits`).then((r) => r.data.visitas),
};
