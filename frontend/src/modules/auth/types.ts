import type { User } from '@/modules/users/types';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface LoginResponse {
  access_token: string;
  token_type: 'bearer';
  expires_at: string;
  user: User;
  permissions: string[];
}

export interface CurrentUserResponse {
  user: User;
  permissions: string[];
}
