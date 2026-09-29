import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/modules/auth/services/authApi';
import type { LoginRequest } from '@/modules/auth/types';
import type { User } from '@/modules/users/types';
import { onUnauthorized } from '@/shared/services/httpClient';
import { tokenStorage } from '@/shared/services/tokenStorage';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
export type LogoutReason = 'manual' | 'expired';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  permissions: Set<string>;
  logoutReason: LogoutReason | null;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: (reason?: LogoutReason) => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<AuthStatus>(() => (tokenStorage.get() ? 'loading' : 'anonymous'));
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout>>();

  const logout = useCallback(
    (reason: LogoutReason = 'manual') => {
      clearTimeout(expiryTimer.current);
      tokenStorage.clear();
      queryClient.clear();
      setUser(null);
      setPermissions(new Set());
      setLogoutReason(reason);
      setStatus('anonymous');
    },
    [queryClient],
  );

  const scheduleExpiry = useCallback(
    (expiresAt: string) => {
      clearTimeout(expiryTimer.current);
      const ms = new Date(expiresAt).getTime() - Date.now();
      // setTimeout max delay is ~24.8 days.
      if (ms > 0 && ms < 2 ** 31 - 1) expiryTimer.current = setTimeout(() => logout('expired'), ms);
    },
    [logout],
  );

  // Restore session on load.
  useEffect(() => {
    const session = tokenStorage.get();
    if (!session) return;
    let cancelled = false;
    authApi
      .me()
      .then((me) => {
        if (cancelled) return;
        setUser(me.user);
        setPermissions(new Set(me.permissions));
        setStatus('authenticated');
        scheduleExpiry(session.expiresAt);
      })
      .catch(() => !cancelled && logout('expired'));
    return () => {
      cancelled = true;
    };
  }, [logout, scheduleExpiry]);

  // Any 401 from the API (expired/invalid token) closes the session.
  useEffect(() => onUnauthorized(() => logout('expired')), [logout]);

  useEffect(() => () => clearTimeout(expiryTimer.current), []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const result = await authApi.login(credentials);
      tokenStorage.set({ token: result.access_token, expiresAt: result.expires_at });
      setUser(result.user);
      setPermissions(new Set(result.permissions));
      setLogoutReason(null);
      setStatus('authenticated');
      scheduleExpiry(result.expires_at);
    },
    [scheduleExpiry],
  );

  const value = useMemo<AuthState>(
    () => ({
      status,
      user,
      permissions,
      logoutReason,
      login,
      logout,
      hasPermission: (code) => permissions.has(code),
      hasAnyPermission: (codes) => codes.some((c) => permissions.has(c)),
    }),
    [status, user, permissions, logoutReason, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
