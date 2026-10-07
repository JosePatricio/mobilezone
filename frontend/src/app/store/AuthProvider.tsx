import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authApi } from '@/modules/auth/services/authApi';
import type { LoginRequest } from '@/modules/auth/types';
import type { User } from '@/modules/users/types';
import { onUnauthorized } from '@/shared/services/httpClient';
import { sessionSync } from '@/shared/services/sessionSync';
import { tokenStorage, type StoredSession } from '@/shared/services/tokenStorage';

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous';
export type LogoutReason = 'manual' | 'expired';

export interface AuthState {
  status: AuthStatus;
  user: User | null;
  permissions: Set<string>;
  logoutReason: LogoutReason | null;
  /** The password is still the cédula / RUC: a warning suggests changing it. */
  defaultPassword: boolean;
  /** Called after the user changes their password (hides the warning). */
  passwordChanged: () => void;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: (reason?: LogoutReason) => void;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
}

export const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  // Without a stored session, a new tab first asks the open tabs for theirs (sessionSync).
  const [status, setStatus] = useState<AuthStatus>(() =>
    tokenStorage.get() || sessionSync.available ? 'loading' : 'anonymous',
  );
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [defaultPassword, setDefaultPassword] = useState(false);
  const [logoutReason, setLogoutReason] = useState<LogoutReason | null>(null);
  const expiryTimer = useRef<ReturnType<typeof setTimeout>>();

  const endSession = useCallback(
    (reason: LogoutReason) => {
      clearTimeout(expiryTimer.current);
      tokenStorage.clear();
      queryClient.clear();
      setUser(null);
      setPermissions(new Set());
      setDefaultPassword(false);
      setLogoutReason(reason);
      setStatus('anonymous');
    },
    [queryClient],
  );

  const logout = useCallback(
    (reason: LogoutReason = 'manual') => {
      // Logging out closes the session in every open tab.
      if (reason === 'manual') sessionSync.publishLogout();
      endSession(reason);
    },
    [endSession],
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

  // Restore the session on load: the stored one, or the one of another open tab.
  useEffect(() => {
    let cancelled = false;
    const restore = (session: StoredSession) => {
      setStatus('loading');
      authApi
        .me()
        .then((me) => {
          if (cancelled) return;
          setUser(me.user);
          setPermissions(new Set(me.permissions));
          setDefaultPassword(Boolean(me.password_por_defecto));
          setLogoutReason(null);
          setStatus('authenticated');
          scheduleExpiry(session.expiresAt);
        })
        .catch(() => !cancelled && endSession('expired'));
    };
    const adopt = (session: StoredSession) => {
      if (cancelled || tokenStorage.get()) return; // this tab already has a session
      tokenStorage.set(session);
      restore(session);
    };

    const stored = tokenStorage.get();
    if (stored) restore(stored);
    else if (sessionSync.available) {
      void sessionSync.request().then((session) => {
        if (session) adopt(session);
        else if (!cancelled && !tokenStorage.get()) setStatus('anonymous');
      });
    }
    const unsubscribe = sessionSync.subscribe({ onSession: adopt, onLogout: () => endSession('manual') });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [endSession, scheduleExpiry]);

  // Any 401 from the API (expired/invalid token) closes the session.
  useEffect(() => onUnauthorized(() => logout('expired')), [logout]);

  useEffect(() => () => clearTimeout(expiryTimer.current), []);

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const result = await authApi.login(credentials);
      const session = { token: result.access_token, expiresAt: result.expires_at };
      tokenStorage.set(session, Boolean(credentials.remember));
      sessionSync.publishSession(session); // other open tabs on the login screen enter too
      setUser(result.user);
      setPermissions(new Set(result.permissions));
      setDefaultPassword(Boolean(result.password_por_defecto));
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
      defaultPassword,
      passwordChanged: () => setDefaultPassword(false),
      login,
      logout,
      hasPermission: (code) => permissions.has(code),
      hasAnyPermission: (codes) => codes.some((c) => permissions.has(c)),
    }),
    [status, user, permissions, logoutReason, defaultPassword, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthState {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}
