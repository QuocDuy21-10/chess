import { generateCodeVerifier, generateState } from 'arctic';
import { and, eq } from 'drizzle-orm';
import { Router } from 'express';
import { cookieOptions, OAUTH, readCookie, SID } from './cookies.ts';
import type { Db } from './db.ts';
import { log } from './log.ts';
import { PROVIDER_NAMES, type Profile, type Provider, type ProviderName } from './providers.ts';
import { accounts, users } from './schema.ts';
import { SESSION_MS, type Sessions } from './sessions.ts';

const FLOW_MS = 10 * 60_000; // how long the provider's sign-in page may take
const MAX_RETURN_TO = 512;

interface Options {
  db: Db;
  sessions: Sessions;
  providers: Partial<Record<ProviderName, Provider>>;
  webUrl: string;
  secure: boolean;
  onLogout?: (userId: string) => void; // closes the user's sockets
}

/** What the `oauth` cookie holds between the redirect to the provider and its callback. */
interface Flow {
  provider: ProviderName;
  state: string;
  verifier: string;
  returnTo: string;
}

/**
 * A path on the site to come back to after signing in, or "/". The browser is always sent to `webUrl` + this,
 * so another site can never be reached; refusing "//" and "/\" is a second guard.
 */
export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || value.length > MAX_RETURN_TO) return '/';
  return value.startsWith('/') && !value.startsWith('//') && !value.startsWith('/\\') ? value : '/';
}

function readFlow(header: string | undefined): Flow | null {
  try {
    const flow = JSON.parse(readCookie(header, OAUTH) ?? '') as Partial<Flow>;
    const strings = [flow.provider, flow.state, flow.verifier, flow.returnTo].every((v) => typeof v === 'string');
    return strings ? (flow as Flow) : null;
  } catch {
    return null;
  }
}

/** The user behind a provider account, created on the first sign-in. A later sign-in keeps the chosen name. */
export async function findOrCreateUser(db: Db, provider: ProviderName, profile: Profile): Promise<string> {
  // shortcut: two first sign-ins of one account in the same instant make the second fail with a 500; signing in
  // again works. Upgrade with ON CONFLICT if it is ever reported.
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ userId: accounts.userId })
      .from(accounts)
      .where(and(eq(accounts.provider, provider), eq(accounts.providerUserId, profile.id)));
    if (found) return found.userId;
    const [user] = await tx
      .insert(users)
      .values({ displayName: profile.name, avatarUrl: profile.avatar })
      .returning({ id: users.id });
    await tx.insert(accounts).values({ provider, providerUserId: profile.id, userId: user.id });
    return user.id;
  });
}

/** /auth/*: signing in with a provider, and signing out. */
export function authRoutes({ db, sessions, providers, webUrl, secure, onLogout }: Options) {
  const router = Router();
  const flowCookie = cookieOptions(secure, '/auth', FLOW_MS);
  const sidCookie = cookieOptions(secure, '/', SESSION_MS);
  const providerOf = (name: string) =>
    Object.hasOwn(providers, name) ? { name: name as ProviderName, provider: providers[name as ProviderName]! } : null;

  router.get('/auth/providers', (_req, res) => {
    res.json(PROVIDER_NAMES.filter((name) => providers[name]));
  });

  router.get('/auth/:provider', (req, res, next) => {
    const found = providerOf(req.params.provider);
    if (!found) return next(); // the JSON 404
    const flow: Flow = {
      provider: found.name,
      state: generateState(),
      verifier: generateCodeVerifier(),
      returnTo: safeReturnTo(req.query.returnTo),
    };
    res.cookie(OAUTH, JSON.stringify(flow), flowCookie);
    res.redirect(found.provider.authorize(flow.state, flow.verifier).toString());
  });

  router.get('/auth/:provider/callback', async (req, res, next) => {
    const found = providerOf(req.params.provider);
    if (!found) return next();
    const flow = readFlow(req.headers.cookie);
    res.clearCookie(OAUTH, { ...flowCookie, maxAge: undefined });
    const { code, state } = req.query;
    if (!flow || flow.provider !== found.name || typeof code !== 'string' || state !== flow.state) {
      return res.redirect(`${webUrl}/?login=failed`); // refused on the provider's page, replayed, or expired
    }
    let profile: Profile;
    try {
      profile = await found.provider.identify(code, flow.verifier);
    } catch (error) {
      log.error('Sign-in failed', error, { provider: found.name }); // a wrong client secret breaks every sign-in
      return res.redirect(`${webUrl}/?login=failed`);
    }
    const userId = await findOrCreateUser(db, found.name, profile);
    res.cookie(SID, await sessions.create(userId), sidCookie);
    res.redirect(`${webUrl}${safeReturnTo(flow.returnTo)}`);
  });

  router.post('/auth/logout', async (req, res) => {
    const token = readCookie(req.headers.cookie, SID);
    if (token) {
      const user = await sessions.find(token);
      await sessions.remove(token);
      if (user) onLogout?.(user.id);
    }
    res.clearCookie(SID, { ...sidCookie, maxAge: undefined });
    res.status(204).end();
  });

  return router;
}
