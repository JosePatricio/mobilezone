import type { ReactElement, ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { vi } from 'vitest';
import { AuthContext, type AuthState } from '@/app/store/AuthProvider';
import type { User } from '@/modules/users/types';
import { ConfirmProvider, ToastProvider } from '@/shared/components';

export const testUser: User = {
  id: 1,
  nombre: 'Ana',
  apellido: 'Pérez',
  email: 'ana@example.com',
  identificacion: '1712345678',
  celular: '0991234567',
  ciudad: 'Quito',
  foto_url: null,
  rol_id: 1,
  role: { id: 1, nombre: 'VENDEDOR' },
  estado: true,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
};

export function fakeAuth(overrides: Partial<AuthState> & { permissionCodes?: string[] } = {}): AuthState {
  const { permissionCodes = [], ...rest } = overrides;
  const permissions = new Set(permissionCodes);
  return {
    status: 'authenticated',
    user: testUser,
    permissions,
    logoutReason: null,
    login: vi.fn(),
    logout: vi.fn(),
    hasPermission: (code) => permissions.has(code),
    hasAnyPermission: (codes) => codes.some((c) => permissions.has(c)),
    ...rest,
  };
}

interface Options {
  auth?: AuthState;
  route?: string;
}

export function renderWithProviders(ui: ReactElement, { auth = fakeAuth(), route = '/' }: Options = {}) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const Wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <MemoryRouter initialEntries={[route]}>
        <ToastProvider>
          <ConfirmProvider>
            <AuthContext.Provider value={auth}>{children}</AuthContext.Provider>
          </ConfirmProvider>
        </ToastProvider>
      </MemoryRouter>
    </QueryClientProvider>
  );
  return { ...render(ui, { wrapper: Wrapper }), queryClient };
}
