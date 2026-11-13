import type { IncomingMessage } from 'node:http';
import { isIPv6 } from 'node:net';
import type { RequestHandler } from 'express';
import proxyaddr from 'proxy-addr';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { log } from './log.ts';

// How much one IP or one account may ask of the server. Counts live in memory: the server is one instance.

export interface Limits {
  httpPerMinute: number; // per IP, every route but the health check
  authPer10Minutes: number; // per IP, starting and finishing a sign-in
  handshakesPerMinute: number; // per IP, Socket.IO handshakes
  maxConnections: number; // all players
  connectionsPerUser: number; // one account's open connections
  eventsPer10Seconds: number; // one account's game events
}

export const LIMITS: Limits = {
  httpPerMinute: 300,
  authPer10Minutes: 60,
  handshakesPerMinute: 60,
  maxConnections: 2000,
  connectionsPerUser: 5,
  eventsPer10Seconds: 20,
};

export type Verdict = { ok: true } | { ok: false; retryAfterMs: number };

export interface Limiter {
  take(key: string): Promise<Verdict>;
}

/** The key an address is counted under: an IPv4 address, or the /64 network of an IPv6 one. */
export function ipKey(address: string): string {
  if (address.startsWith('::ffff:') && address.includes('.')) return address.slice(7);
  if (!isIPv6(address)) return address;
  // One IPv6 host usually has a whole /64 to rotate through.
  const [head, tail = ''] = address.split('::');
  const left = head ? head.split(':') : [];
  const right = tail ? tail.split(':') : [];
  const zeros = Array<string>(8 - left.length - right.length).fill('0');
  const groups = address.includes('::') ? [...left, ...zeros, ...right] : left;
  return `${groups.slice(0, 4).map((group) => group.toLowerCase().padStart(4, '0')).join(':')}::/64`;
}

/** `points` per `seconds` for each key. Logs the first refusal of each key in each window. */
export function limiter(name: string, points: number, seconds: number): Limiter {
  const store = new RateLimiterMemory({ keyPrefix: name, points, duration: seconds });
  return {
    async take(key) {
      try {
        await store.consume(key);
        return { ok: true };
      } catch (rejection) {
        if (!(rejection instanceof RateLimiterRes)) throw rejection;
        if (rejection.consumedPoints === points + 1) log.warn('Rate limited', { limit: name, key });
        return { ok: false, retryAfterMs: rejection.msBeforeNext };
      }
    },
  };
}

/** Express middleware: refuses a request past `limit`, counted per client IP (`req.ip`, after `trust proxy`). */
export function perIp(limit: Limiter): RequestHandler {
  return (req, res, next) => {
    limit.take(ipKey(req.ip ?? '')).then((verdict) => {
      if (verdict.ok) return next();
      res.set('Retry-After', String(Math.ceil(verdict.retryAfterMs / 1000)));
      res.status(429).json({ error: 'rate-limited' });
    }, next);
  };
}

/** The client's address behind `hops` proxies: the rule Express applies when `trust proxy` is a number. */
export const clientIp = (req: IncomingMessage, hops: number): string => proxyaddr(req, (_address, hop) => hop < hops);
