import { act, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { testUser } from '@/test/utils';
import { tokenStorage } from '@/shared/services/tokenStorage';
import { AuthProvider, useAuth } from './AuthProvider';

const api = vi.hoisted(() => ({ login: vi.fn(), me: vi.fn() }));
vi.mock('@/modules/auth/services/authApi', () => ({ authApi: api }));

const future = () => new Date(Date.now() + 3_600_000).toISOString();
const session = () => ({ token: 'tok-123', expiresAt: future() });

function Status() {
  const { status, user } = useAuth();
  return <p>{status === 'authenticated' ? `in:${user?.nombre}` : status}</p>;
}

const renderTab = () =>
  render(
    <QueryClientProvider client={new QueryClient()}>
      <AuthProvider>
        <Status />
      </AuthProvider>
    </QueryClientProvider>,
  );

/** Another browser tab of the app. */
let otherTab: BroadcastChannel;
beforeEach(() => {
  vi.clearAllMocks();
  otherTab = new BroadcastChannel('mz.session');
  api.me.mockResolvedValue({ user: testUser, permissions: [] });
});
afterEach(() => otherTab.close());

describe('tokenStorage', () => {
  it('keeps the session in localStorage only when asked to', () => {
    tokenStorage.set(session());
    expect(sessionStorage.getItem('mz.session')).not.toBeNull();
    expect(localStorage.getItem('mz.session')).toBeNull();

    tokenStorage.set(session(), true);
    expect(localStorage.getItem('mz.session')).not.toBeNull();
    expect(sessionStorage.getItem('mz.session')).toBeNull();
    expect(tokenStorage.get()?.token).toBe('tok-123');

    tokenStorage.clear();
    expect(tokenStorage.get()).toBeNull();
  });
});

describe('AuthProvider across tabs', () => {
  it('a new tab takes the session of an open tab', async () => {
    otherTab.onmessage = (event) => {
      if (event.data.type === 'request') otherTab.postMessage({ type: 'session', session: session() });
    };
    renderTab();
    expect(await screen.findByText('in:Ana')).toBeInTheDocument();
    expect(tokenStorage.get()?.token).toBe('tok-123');
  });

  it('a kept session (localStorage) is restored directly', async () => {
    tokenStorage.set(session(), true);
    renderTab();
    expect(await screen.findByText('in:Ana')).toBeInTheDocument();
  });

  it('without other tabs it asks to log in', async () => {
    renderTab();
    expect(await screen.findByText('anonymous')).toBeInTheDocument();
    expect(api.me).not.toHaveBeenCalled();
  });

  it('a logout in another tab closes this one too', async () => {
    tokenStorage.set(session());
    renderTab();
    await screen.findByText('in:Ana');
    act(() => otherTab.postMessage({ type: 'logout' }));
    await waitFor(() => expect(screen.getByText('anonymous')).toBeInTheDocument());
    expect(tokenStorage.get()).toBeNull();
  });
});
