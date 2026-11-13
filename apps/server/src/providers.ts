import { decodeIdToken, GitHub, Google } from 'arctic';
import type { OAuthApp } from './config.ts';

// Google and GitHub behind one interface, so the routes do not care which, and tests can pass a fake.

export const PROVIDER_NAMES = ['google', 'github'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

/** Who the provider says signed in. `id` is the provider's stable id, never an email or a login. */
export interface Profile {
  id: string;
  name: string;
  avatar: string | null;
}

export interface Provider {
  /** The provider's sign-in page. GitHub takes no PKCE verifier and ignores it. */
  authorize(state: string, verifier: string): URL;
  /** Trades the callback's code for the player's profile. Throws when the provider refuses the code. */
  identify(code: string, verifier: string): Promise<Profile>;
}

const NAME_LENGTH = 32;
const FALLBACK_NAME = 'Player';

/** A provider's name made to fit `users.display_name`: trimmed, at most 32 characters, never empty. */
export function cleanName(raw: string | null | undefined): string {
  const name = Array.from((raw ?? '').trim()) // characters, not UTF-16 units, as Postgres counts them
    .slice(0, NAME_LENGTH)
    .join('')
    .trim();
  return name || FALLBACK_NAME;
}

function google({ clientId, clientSecret }: OAuthApp, redirectUri: string): Provider {
  const client = new Google(clientId, clientSecret, redirectUri);
  return {
    authorize: (state, verifier) => client.createAuthorizationURL(state, verifier, ['openid', 'profile']),
    async identify(code, verifier) {
      const tokens = await client.validateAuthorizationCode(code, verifier);
      // The ID token came straight from Google over TLS in exchange for the code, so it is not verified again.
      const claims = decodeIdToken(tokens.idToken()) as { sub: string; name?: string; picture?: string };
      return { id: claims.sub, name: cleanName(claims.name), avatar: claims.picture ?? null };
    },
  };
}

function github({ clientId, clientSecret }: OAuthApp, redirectUri: string): Provider {
  const client = new GitHub(clientId, clientSecret, redirectUri);
  return {
    authorize: (state) => client.createAuthorizationURL(state, []), // no scopes: the public profile is enough
    async identify(code) {
      const tokens = await client.validateAuthorizationCode(code);
      const response = await fetch('https://api.github.com/user', {
        headers: {
          Authorization: `Bearer ${tokens.accessToken()}`,
          Accept: 'application/vnd.github+json',
          'User-Agent': 'combat-chess', // GitHub refuses requests without one
        },
      });
      if (!response.ok) throw new Error(`GitHub /user answered ${response.status}`);
      const user = (await response.json()) as { id: number; login: string; name: string | null; avatar_url: string };
      return { id: String(user.id), name: cleanName(user.name || user.login), avatar: user.avatar_url || null };
    },
  };
}

const FACTORIES = { google, github };

/** The configured providers, each with its callback URL on `publicUrl`. */
export function createProviders(oauth: Partial<Record<ProviderName, OAuthApp>>, publicUrl: string) {
  const providers: Partial<Record<ProviderName, Provider>> = {};
  for (const name of PROVIDER_NAMES) {
    const app = oauth[name];
    if (app) providers[name] = FACTORIES[name](app, `${publicUrl}/auth/${name}/callback`);
  }
  return providers;
}
