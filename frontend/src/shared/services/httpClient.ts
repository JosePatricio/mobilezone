import axios from 'axios';
import { toApiError } from './apiError';
import { tokenStorage } from './tokenStorage';

type UnauthorizedListener = (code: string) => void;
const unauthorizedListeners = new Set<UnauthorizedListener>();

/** Lets the auth provider react to 401 responses (expired/invalid session). */
export function onUnauthorized(listener: UnauthorizedListener): () => void {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

export const http = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL ?? '/api/v1',
  timeout: 20000,
  headers: { 'Content-Type': 'application/json' },
});

http.interceptors.request.use((config) => {
  const session = tokenStorage.get();
  if (session) config.headers.Authorization = `Bearer ${session.token}`;
  return config;
});

http.interceptors.response.use(
  (response) => response,
  (error) => {
    const apiError = toApiError(error);
    const sentToken = Boolean(error?.config?.headers?.Authorization);
    if (apiError.status === 401 && sentToken) {
      unauthorizedListeners.forEach((listener) => listener(apiError.code));
    }
    return Promise.reject(apiError);
  },
);
