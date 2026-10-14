import { http } from '@/shared/services/httpClient';
import type {
  Campaign,
  CampaignCreated,
  CampaignDetail,
  CampaignRequest,
  OrderClient,
  WhatsAppTemplate,
} from '../types';

export const MARKETING_KEY = 'marketing';

export const marketingApi = {
  /** Active clients with at least one work order (not the ones that only bought in Ventas). */
  recipients: () => http.get<OrderClient[]>('/marketing/recipients').then((r) => r.data),

  /** Templates approved by Meta for the WhatsApp Business account. */
  templates: () => http.get<WhatsAppTemplate[]>('/marketing/whatsapp/templates').then((r) => r.data),

  /** Queues the template for the clients; the server sends it in the background. Multipart: the header may need a file. */
  createCampaign: (data: CampaignRequest, file?: File | null) => {
    const form = new FormData();
    form.append('data', JSON.stringify(data));
    if (file) form.append('file', file);
    return http
      .post<CampaignCreated>('/marketing/whatsapp/campaigns', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  campaigns: () => http.get<Campaign[]>('/marketing/whatsapp/campaigns').then((r) => r.data),

  campaign: (id: number) => http.get<CampaignDetail>(`/marketing/whatsapp/campaigns/${id}`).then((r) => r.data),
};
