/**
 * Session persistence. The token is kept in sessionStorage (cleared when the
 * tab/browser closes) and never rendered in the UI. Passwords are never stored.
 * Moving to httpOnly cookies would require a backend change (pending strategy).
 */
export interface StoredSession {
  token: string;
  expiresAt: string;
}

const KEY = 'mz.session';

export const tokenStorage = {
  get(): StoredSession | null {
    try {
      const raw = sessionStorage.getItem(KEY);
      if (!raw) return null;
      const session = JSON.parse(raw) as StoredSession;
      if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
        sessionStorage.removeItem(KEY);
        return null;
      }
      return session;
    } catch {
      return null;
    }
  },
  set(session: StoredSession): void {
    try {
      sessionStorage.setItem(KEY, JSON.stringify(session));
    } catch {
      /* storage unavailable: session lives only in memory */
    }
  },
  clear(): void {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};
