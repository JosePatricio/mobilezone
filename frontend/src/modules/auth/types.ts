import type { User } from '@/modules/users/types';

export interface LoginRequest {
  email: string;
  password: string;
  /** "Mantener la sesión iniciada": longer session, kept after closing the browser. */
  remember?: boolean;
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
