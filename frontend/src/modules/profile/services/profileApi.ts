import { http } from '@/shared/services/httpClient';

export interface ChangePasswordRequest {
  current_password: string;
  new_password: string;
}

export const profileApi = {
  /** The logged user changes their own password (400 INVALID_CURRENT_PASSWORD if the current one is wrong). */
  changePassword: (body: ChangePasswordRequest) => http.post('/auth/change-password', body).then(() => undefined),
};
