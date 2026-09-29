import { http } from '@/shared/services/httpClient';
import type { CurrentUserResponse, LoginRequest, LoginResponse } from '../types';

export const authApi = {
  login: (body: LoginRequest) => http.post<LoginResponse>('/auth/login', body).then((r) => r.data),
  me: () => http.get<CurrentUserResponse>('/auth/me').then((r) => r.data),
};
