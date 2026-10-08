import type { User } from '@/modules/users/types';
import { http } from '@/shared/services/httpClient';
import { deleteImage, uploadImage } from '@/shared/services/uploads';

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

/** Own data the user can change; role, branches and cédula stay with the administrator. */
export interface ProfileRequest {
  nombre: string;
  apellido: string;
  email: string;
  celular: string | null;
  provincia: string | null;
  ciudad: string | null;
  direccion: string | null;
}

export const profileApi = {
  update: (body: ProfileRequest) => http.put<User>('/auth/me', body).then((r) => r.data),
  uploadPhoto: (file: File) => uploadImage<User>('/auth/me/photo', file),
  removePhoto: () => deleteImage<User>('/auth/me/photo'),
  /** The logged user changes their own password (400 INVALID_CURRENT_PASSWORD if the current one is wrong). */
  changePassword: (body: ChangePasswordRequest) => http.post('/auth/change-password', body).then(() => undefined),
};
