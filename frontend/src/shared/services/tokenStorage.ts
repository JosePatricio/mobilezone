/**
 * Session persistence. The token is never rendered in the UI and passwords are never stored.
 *
 * - "Mantener la sesión iniciada" checked: localStorage (shared by every tab, survives closing the browser).
 * - Unchecked: sessionStorage (ends when the browser closes); other open tabs receive it through
 *   `sessionSync`, so a URL opened in a new tab keeps working.
 *
 * Moving to httpOnly cookies would require a backend change (pending strategy).
 */
export interface StoredSession {
  token: string;
  expiresAt: string;
}

const KEY = 'mz.session';

function read(storage: Storage): StoredSession | null {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return null;
    const session = JSON.parse(raw) as StoredSession;
    if (!session.token || new Date(session.expiresAt).getTime() <= Date.now()) {
      storage.removeItem(KEY);
      return null;
    }
    return session;
  } catch {
    return null;
  }
}

function remove(storage: Storage): void {
  try {
    storage.removeItem(KEY);
  } catch {
    /* ignore */
  }
}

export const tokenStorage = {
  get(): StoredSession | null {
    return read(sessionStorage) ?? read(localStorage);
  },
  /** `remember` = "Mantener la sesión iniciada". */
  set(session: StoredSession, remember = false): void {
    try {
      (remember ? localStorage : sessionStorage).setItem(KEY, JSON.stringify(session));
      remove(remember ? sessionStorage : localStorage);
    } catch {
      /* storage unavailable: session lives only in memory */
    }
  },
  clear(): void {
    remove(sessionStorage);
    remove(localStorage);
  },
};
