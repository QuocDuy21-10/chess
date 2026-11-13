import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { useAccount } from './account';

// The account store against a stubbed fetch: each test lists what the server answers, by path.

const account = () => useAccount.getState();
const replaceState = vi.fn();
let answers: Record<string, () => Response>;
const calls: { url: string; init: RequestInit }[] = [];

const json = (body: unknown, status = 200) => () => Response.json(body, { status });
const ANN = { id: 'u1', name: 'Ann', avatar: null, rating: 1500, gamesPlayed: 0 };

beforeEach(() => {
  useAccount.setState({ status: 'loading', user: null, providers: [], loginFailed: false });
  calls.length = 0;
  replaceState.mockClear();
  vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'http://api.test');
  vi.stubGlobal('location', { pathname: '/', search: '' });
  vi.stubGlobal('history', { replaceState });
  vi.stubGlobal('fetch', async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const path = url.replace('http://api.test', '').split('?')[0];
    const answer = answers[`${init.method ?? 'GET'} ${path}`];
    if (!answer) throw new TypeError('fetch failed');
    return answer();
  });
  answers = { 'GET /auth/providers': json(['google', 'github']) };
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

test('a signed-in player is loaded with the cookie, and the providers are listed', async () => {
  answers['GET /me'] = json(ANN);
  await account().load();
  expect(account()).toMatchObject({ status: 'signed-in', user: ANN, providers: ['google', 'github'] });
  expect(calls.every((c) => c.init.credentials === 'include')).toBe(true);
});

test('no session is signed out; no server is unreachable', async () => {
  answers['GET /me'] = json({ error: 'unauthorized' }, 401);
  await account().load();
  expect(account()).toMatchObject({ status: 'signed-out', user: null, providers: ['google', 'github'] });
  answers = {};
  await account().load();
  expect(account().status).toBe('unreachable');
});

test('a failed sign-in is reported once, and its marker leaves the address but the room stays', async () => {
  vi.stubGlobal('location', { pathname: '/', search: '?room=abcdefgh&login=failed' });
  answers['GET /me'] = json({ error: 'unauthorized' }, 401);
  await account().load();
  expect(account().loginFailed).toBe(true);
  expect(replaceState).toHaveBeenCalledWith(null, '', '/?room=abcdefgh');
});

test('a rename the server refuses resolves false and keeps the name', async () => {
  useAccount.setState({ status: 'signed-in', user: ANN });
  answers['PATCH /me'] = json({ error: 'bad-request' }, 400);
  expect(await account().rename('   ')).toBe(false);
  expect(account().user?.name).toBe('Ann');
  answers['PATCH /me'] = json({ ...ANN, name: 'Annie' });
  expect(await account().rename('Annie')).toBe(true);
  expect(account().user?.name).toBe('Annie');
  expect(calls.at(-1)?.init).toMatchObject({ method: 'PATCH', body: '{"name":"Annie"}' });
});

test('signing out forgets the player, even when the server cannot be reached', async () => {
  useAccount.setState({ status: 'signed-in', user: ANN });
  await account().logout();
  expect(account()).toMatchObject({ status: 'signed-out', user: null });
});

test('history asks for the page after the cursor, and a lost session signs out', async () => {
  useAccount.setState({ status: 'signed-in', user: ANN });
  answers['GET /me/games'] = json({ games: [], next: null });
  expect(await account().history('2026-11-01T00:00:00.000Z,abc')).toEqual({ games: [], next: null });
  expect(calls.at(-1)?.url).toBe('http://api.test/me/games?before=2026-11-01T00%3A00%3A00.000Z%2Cabc');
  answers['GET /me/games'] = json({ error: 'unauthorized' }, 401);
  await expect(account().history()).rejects.toThrow('401');
  expect(account().status).toBe('signed-out');
});
