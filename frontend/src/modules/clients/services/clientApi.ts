import { createCrudApi } from '@/shared/services/crudApi';
import type { Client, ClientRequest } from '../types';

export const CLIENTS_KEY = 'clients';
export const clientApi = createCrudApi<Client, ClientRequest>('/clients');
