import { parseCookie } from 'cookie';
import type { CookieOptions } from 'express';

// The two cookies the server sets, and reading them back. Express sets cookies itself but does not parse them.

export const SID = 'sid';
export const OAUTH = 'oauth';

/** The value of cookie `name` in a Cookie header, or undefined. */
export function readCookie(header: string | undefined, name: string): string | undefined {
  return header ? parseCookie(header)[name] : undefined;
}

/**
 * Lax: sent on the site's own requests and on the provider's redirect back to the callback. Secure only in
 * production, because Safari drops Secure cookies on http://localhost.
 */
export const cookieOptions = (secure: boolean, path: string, maxAge: number): CookieOptions => ({
  httpOnly: true,
  sameSite: 'lax',
  secure,
  path,
  maxAge,
});
