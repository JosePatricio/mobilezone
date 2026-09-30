import { createCrudApi } from '@/shared/services/crudApi';
import { http } from '@/shared/services/httpClient';
import { deleteImage, uploadImage } from '@/shared/services/uploads';
import type { Id, UserRef } from '@/shared/types/api';
import type { User, UserRequest } from '../types';

export const USERS_KEY = 'users';

export const userApi = {
  ...createCrudApi<User, UserRequest>('/users'),
  /** Active technicians, for work order selectors/filters. */
  technicians: () => http.get<UserRef[]>('/users/technicians').then((r) => r.data),
  uploadPhoto: (id: Id, file: File) => uploadImage<User>(`/users/${id}/photo`, file),
  removePhoto: (id: Id) => deleteImage<User>(`/users/${id}/photo`),
};
