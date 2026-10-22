import { http } from '@/shared/services/httpClient';
import type {
  Campaign,
  CampaignCreated,
  CampaignDetail,
  CampaignRequest,
  OrderClient,
  PublicRoulette,
  Roulette,
  RouletteDetail,
  RouletteItemDraft,
  RouletteRequest,
  WhatsAppTemplate,
} from '../types';

export const MARKETING_KEY = 'marketing';
export const ROULETTES_KEY = [MARKETING_KEY, 'roulettes'];

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

  roulettes: () => http.get<Roulette[]>('/marketing/roulettes').then((r) => r.data),

  roulette: (id: number) => http.get<RouletteDetail>(`/marketing/roulettes/${id}`).then((r) => r.data),

  /** One multipart request: each option points to its image by its position in "images". */
  createRoulette: (data: Omit<RouletteRequest, 'items'>, items: RouletteItemDraft[]) => {
    const form = new FormData();
    const files = items.flatMap((i) => (i.file ? [i.file] : []));
    let next = 0;
    const body: RouletteRequest = {
      ...data,
      items: items.map((i) => ({ nombre: i.nombre.trim(), premio: i.premio, imagen: i.file ? next++ : null })),
    };
    form.append('data', JSON.stringify(body));
    files.forEach((file) => form.append('images', file));
    return http
      .post<Roulette>('/marketing/roulettes', form, { headers: { 'Content-Type': 'multipart/form-data' } })
      .then((r) => r.data);
  },

  deleteRoulette: (id: number) => http.delete<void>(`/marketing/roulettes/${id}`).then(() => undefined),
};

/** The page of the client: no session, opened from the link of the message. */
export const publicRouletteApi = {
  /** The first visit records when the link was opened. */
  get: (token: string) => http.get<PublicRoulette>(`/public/roulette/${token}`).then((r) => r.data),
  /** The server chooses the option; the link stops working. */
  play: (token: string) => http.post<PublicRoulette>(`/public/roulette/${token}/play`).then((r) => r.data),
};
