import { afterAll, beforeEach, expect, test } from 'vitest';
import { createApp } from './app.ts';
import { safeReturnTo } from './auth.ts';
import { cleanName, type Profile, type Provider } from './providers.ts';
import { connectTest, truncate } from './test-db.ts';

// The real server with a fake GitHub: `identify` answers for the codes below and refuses any other.

const PROFILES: Record<string, Profile> = {
  'ann-code': { id: '1001', name: 'Ann', avatar: 'https://avatars.example/ann.png' },
  'ann-code-again': { id: '1001', name: 'Ann Renamed At GitHub', avatar: null },
  'bob-code': { id: '1002', name: 'Bob', avatar: null },
};
const fakeGitHub: Provider = {
  authorize: (state) => new URL(`https://github.example/login?state=${state}`),
  async identify(code) {
    const profile = PROFILES[code];
    if (!profile) throw new Error('bad code');
    return profile;
  },
};

const WEB = 'http://localhost:3000';
const { pool, db } = connectTest();
let app: ReturnType<typeof createApp>;
let base: string;

beforeEach(async () => {
  await truncate(pool);
  app = createApp({ db, providers: { github: fakeGitHub }, webUrl: WEB });
  base = `http://localhost:${await app.listen(0)}`;
  return () => app.close();
});
afterAll(() => pool.end());

/** A request that does not follow redirects, so the test sees each one. */
const get = (path: string, cookie = '') => fetch(base + path, { redirect: 'manual', headers: { cookie } });
/** The `name=value` part of the Set-Cookie for `name`. */
const cookieFrom = (res: Response, name: string) =>
  res.headers.getSetCookie().find((c) => c.startsWith(`${name}=`))?.split(';')[0] ?? '';

/** Goes through the whole sign-in with the fake GitHub. Returns the callback's response. */
async function signIn(code: string, returnTo = '/') {
  const start = await get(`/auth/github?returnTo=${encodeURIComponent(returnTo)}`);
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  return get(`/auth/github/callback?code=${code}&state=${state}`, cookieFrom(start, 'oauth'));
}

test('returnTo keeps a path on the site and turns anything else into /', () => {
  expect(safeReturnTo('/?room=abcdefgh')).toBe('/?room=abcdefgh');
  for (const bad of ['//evil.example', '/\\evil.example', 'https://evil.example', 'room', '', undefined, ['/'], `/${'a'.repeat(600)}`]) {
    expect(safeReturnTo(bad), String(bad)).toBe('/');
  }
});

test('a provider name is cut to 32 characters and never left empty', () => {
  expect(cleanName('  Ann  ')).toBe('Ann');
  expect(cleanName('x'.repeat(40))).toBe('x'.repeat(32));
  expect(cleanName('😀'.repeat(40))).toHaveLength(64); // 32 characters, each two UTF-16 units
  expect(cleanName('   ')).toBe('Player');
  expect(cleanName(null)).toBe('Player');
});

test('the configured providers are listed, and an unknown one is a 404', async () => {
  expect(await (await get('/auth/providers')).json()).toEqual(['github']);
  for (const path of ['/auth/google', '/auth/constructor', '/auth/google/callback']) {
    expect((await get(path)).status, path).toBe(404);
  }
});

test('signing in sends the browser to the provider, then back to the page it came from with a session', async () => {
  const start = await get('/auth/github?returnTo=%2F%3Froom%3Dabcdefgh');
  expect(start.status).toBe(302);
  expect(start.headers.get('location')).toMatch(/^https:\/\/github\.example\/login\?state=/);
  expect(start.headers.getSetCookie()[0]).toMatch(/^oauth=.+; Max-Age=600; Path=\/auth; .*HttpOnly; SameSite=Lax$/);

  const back = await signIn('ann-code', '/?room=abcdefgh');
  expect(back.status).toBe(302);
  expect(back.headers.get('location')).toBe(`${WEB}/?room=abcdefgh`);
  const sid = cookieFrom(back, 'sid');
  expect(back.headers.getSetCookie().find((c) => c.startsWith('sid='))).toMatch(/Max-Age=2592000; Path=\/; .*HttpOnly; SameSite=Lax$/);
  expect(await app.sessions.find(sid.slice(4))).toMatchObject({
    name: 'Ann',
    avatar: 'https://avatars.example/ann.png',
    rating: 1500,
  });
});

test('signing in again reuses the user and keeps the name they chose', async () => {
  const first = cookieFrom(await signIn('ann-code'), 'sid').slice(4);
  const user = await app.sessions.find(first);
  await pool.query("UPDATE users SET display_name = 'Annie' WHERE id = $1", [user!.id]);
  const second = cookieFrom(await signIn('ann-code-again'), 'sid').slice(4);
  expect(await app.sessions.find(second)).toMatchObject({ id: user!.id, name: 'Annie' });
  await signIn('bob-code');
  expect((await pool.query('SELECT count(*)::int AS n FROM users')).rows[0].n).toBe(2);
});

test('a callback without the flow cookie, with the wrong state, or with a refused code fails back to the site', async () => {
  const start = await get('/auth/github');
  const flow = cookieFrom(start, 'oauth');
  const state = new URL(start.headers.get('location')!).searchParams.get('state');
  const failed = `${WEB}/?login=failed`;
  expect((await get(`/auth/github/callback?code=ann-code&state=${state}`)).headers.get('location')).toBe(failed);
  expect((await get('/auth/github/callback?code=ann-code&state=forged', flow)).headers.get('location')).toBe(failed);
  expect((await get('/auth/github/callback?error=access_denied', flow)).headers.get('location')).toBe(failed);
  const log = console.error;
  console.error = () => {};
  expect((await get(`/auth/github/callback?code=wrong&state=${state}`, flow)).headers.get('location')).toBe(failed);
  console.error = log;
  expect((await pool.query('SELECT count(*)::int AS n FROM sessions')).rows[0].n).toBe(0);
});

test('signing out ends the session and clears the cookie', async () => {
  const sid = cookieFrom(await signIn('ann-code'), 'sid');
  const out = await fetch(`${base}/auth/logout`, { method: 'POST', headers: { cookie: sid } });
  expect(out.status).toBe(204);
  expect(out.headers.getSetCookie()[0]).toMatch(/^sid=; Path=\/; Expires=Thu, 01 Jan 1970/);
  expect(await app.sessions.find(sid.slice(4))).toBeNull();
});

test('in production a POST from another site is refused, and the site may call with its cookie', async () => {
  const site = 'https://chess.example.com';
  const strict = createApp({ db, providers: { github: fakeGitHub }, origins: [site], webUrl: site });
  const url = `http://localhost:${await strict.listen(0)}/auth/logout`;
  try {
    expect((await fetch(url, { method: 'POST' })).status).toBe(403);
    expect((await fetch(url, { method: 'POST', headers: { origin: 'https://evil.example' } })).status).toBe(403);
    const ok = await fetch(url, { method: 'POST', headers: { origin: site } });
    expect(ok.status).toBe(204);
    expect(ok.headers.get('access-control-allow-origin')).toBe(site);
    expect(ok.headers.get('access-control-allow-credentials')).toBe('true');
  } finally {
    await strict.close();
  }
});
