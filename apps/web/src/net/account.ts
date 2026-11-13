import type { HistoryPage, User } from '@chess/shared/account';
import { create } from 'zustand';
import { serverUrl } from './server';

// The signed-in player, from the game server's REST routes. The sid cookie is the server's; this side never reads it.

export type AccountStatus = 'loading' | 'signed-out' | 'signed-in' | 'unreachable';

interface AccountState {
  status: AccountStatus;
  user: User | null;
  providers: string[]; // the sign-in buttons to show: 'google', 'github'
  loginFailed: boolean; // the last sign-in came back with ?login=failed
  load(): Promise<void>;
  /** Saves a new name. Resolves false when the server refuses it (blank, or over 32 characters). */
  rename(name: string): Promise<boolean>;
  logout(): Promise<void>;
  history(before?: string): Promise<HistoryPage>;
}

/** A call to the game server with the sid cookie. */
const call = (path: string, init: RequestInit = {}) =>
  fetch(serverUrl() + path, {
    ...init,
    credentials: 'include',
    headers: init.body ? { 'content-type': 'application/json' } : undefined,
  });

/** Takes ?login=failed out of the address, keeping the rest (an invite link's ?room=). Returns whether it was there. */
function takeLoginFailed(): boolean {
  const params = new URLSearchParams(location.search);
  if (params.get('login') !== 'failed') return false;
  params.delete('login');
  const query = params.toString();
  history.replaceState(null, '', query ? `${location.pathname}?${query}` : location.pathname);
  return true;
}

export const useAccount = create<AccountState>((set) => ({
  status: 'loading',
  user: null,
  providers: [],
  loginFailed: false,

  async load() {
    if (takeLoginFailed()) set({ loginFailed: true });
    try {
      const [me, providers] = await Promise.all([call('/me'), call('/auth/providers')]);
      if (!providers.ok) throw new Error(`providers: ${providers.status}`);
      set({ providers: (await providers.json()) as string[] });
      if (me.status === 401) return set({ status: 'signed-out', user: null });
      if (!me.ok) throw new Error(`me: ${me.status}`);
      set({ status: 'signed-in', user: (await me.json()) as User, loginFailed: false });
    } catch {
      set({ status: 'unreachable', user: null });
    }
  },

  async rename(name) {
    const res = await call('/me', { method: 'PATCH', body: JSON.stringify({ name }) });
    if (res.status === 401) set({ status: 'signed-out', user: null });
    if (!res.ok) return false;
    set({ user: (await res.json()) as User });
    return true;
  },

  async logout() {
    await call('/auth/logout', { method: 'POST' }).catch(() => {}); // signed out here either way
    set({ status: 'signed-out', user: null });
  },

  async history(before) {
    const res = await call(`/me/games${before ? `?before=${encodeURIComponent(before)}` : ''}`);
    if (res.status === 401) set({ status: 'signed-out', user: null });
    if (!res.ok) throw new Error(`history: ${res.status}`);
    return (await res.json()) as HistoryPage;
  },
}));
