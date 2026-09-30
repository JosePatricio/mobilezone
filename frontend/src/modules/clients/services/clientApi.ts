import { createCrudApi } from '@/shared/services/crudApi';
import { deleteImage, uploadImage } from '@/shared/services/uploads';
import type { Id } from '@/shared/types/api';
import type { Client, ClientRequest } from '../types';

export const CLIENTS_KEY = 'clients';

export const clientApi = {
  ...createCrudApi<Client, ClientRequest>('/clients'),
  uploadPhoto: (id: Id, file: File) => uploadImage<Client>(`/clients/${id}/photo`, file),
  removePhoto: (id: Id) => deleteImage<Client>(`/clients/${id}/photo`),
};
