import { tokenStorage, type StoredSession } from './tokenStorage';

/**
 * Keeps the open tabs of the app in the same session (BroadcastChannel):
 * a new tab asks the others for the session, a login is shared and a logout closes every tab.
 */
type Message =
  | { type: 'request' }
  | { type: 'session'; session: StoredSession }
  | { type: 'logout' };

export interface SessionSyncHandlers {
  /** Another tab logged in, or answered our request. */
  onSession: (session: StoredSession) => void;
  /** The user logged out in another tab. */
  onLogout: () => void;
}

const CHANNEL = 'mz.session';
/** How long a new tab waits for an open tab to share its session. */
export const SESSION_REQUEST_TIMEOUT_MS = 300;

// One channel per tab: a channel never receives its own messages, so a tab ignores what it sends.
let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel === undefined) {
    try {
      channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
    } catch {
      channel = null;
    }
  }
  return channel;
}

function post(message: Message): void {
  getChannel()?.postMessage(message);
}

export const sessionSync = {
  get available(): boolean {
    return getChannel() !== null;
  },

  /** Asks the other open tabs for their session; null when none answers in time. */
  request(timeoutMs = SESSION_REQUEST_TIMEOUT_MS): Promise<StoredSession | null> {
    const ch = getChannel();
    if (!ch) return Promise.resolve(null);
    return new Promise((resolve) => {
      const listener = (event: MessageEvent<Message>) => {
        if (event.data?.type === 'session') done(event.data.session);
      };
      const done = (session: StoredSession | null) => {
        clearTimeout(timer);
        ch.removeEventListener('message', listener);
        resolve(session);
      };
      const timer = setTimeout(() => done(null), timeoutMs);
      ch.addEventListener('message', listener);
      post({ type: 'request' });
    });
  },

  /** Answers the session requests of new tabs and reports logins / logouts of other tabs. */
  subscribe(handlers: SessionSyncHandlers): () => void {
    const ch = getChannel();
    if (!ch) return () => undefined;
    const listener = (event: MessageEvent<Message>) => {
      const message = event.data;
      if (message?.type === 'request') {
        const session = tokenStorage.get();
        if (session) post({ type: 'session', session });
      } else if (message?.type === 'session') {
        handlers.onSession(message.session);
      } else if (message?.type === 'logout') {
        handlers.onLogout();
      }
    };
    ch.addEventListener('message', listener);
    return () => ch.removeEventListener('message', listener);
  },

  publishSession(session: StoredSession): void {
    post({ type: 'session', session });
  },

  publishLogout(): void {
    post({ type: 'logout' });
  },
};
