import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import { deleteImage, uploadImage } from '@/shared/services/uploads';
import type { Id, UserRef } from '@/shared/types/api';
import type { User, UserRequest, UserUsage } from '../types';

export const USERS_KEY = 'users';

export const userApi = {
  ...createCrudApi<User, UserRequest>('/users'),
  /** Active technicians, for work order selectors/filters. */
  technicians: () => http.get<UserRef[]>('/users/technicians').then((r) => r.data),
  uploadPhoto: (id: Id, file: File) => uploadImage<User>(`/users/${id}/photo`, file),
  removePhoto: (id: Id) => deleteImage<User>(`/users/${id}/photo`),
  /** Sales and orders of the user (confirmation before deleting it). */
  usage: (id: Id) => http.get<UserUsage>(`/users/${id}/usage`).then((r) => r.data),
  /** Deletes the user; its sales and orders go to `reassignTo` (required when it has any). */
  deleteUser: (id: Id, reassignTo?: Id) =>
    http.delete(`/users/${id}`, { params: reassignTo ? { reassign_to: reassignTo } : {} }).then(() => undefined),
};
