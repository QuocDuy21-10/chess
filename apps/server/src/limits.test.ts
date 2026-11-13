import type { IncomingMessage } from 'node:http';
import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { clientIp, ipKey, limiter } from './limits.ts';
import { log } from './log.ts';

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(log, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

test('ipKey keeps an IPv4 address and unwraps an IPv4-mapped one', () => {
  expect(ipKey('203.0.113.7')).toBe('203.0.113.7');
  expect(ipKey('::ffff:203.0.113.7')).toBe('203.0.113.7');
});

test('ipKey counts an IPv6 address under its /64 network', () => {
  const net = '2001:0db8:00aa:00bb::/64';
  expect(ipKey('2001:db8:aa:bb:1:2:3:4')).toBe(net);
  expect(ipKey('2001:db8:aa:bb::9')).toBe(net);
  expect(ipKey('2001:DB8:AA:BB:ffff::1')).toBe(net);
  expect(ipKey('2001:db8:aa:bc::1')).toBe('2001:0db8:00aa:00bc::/64');
  expect(ipKey('::1')).toBe('0000:0000:0000:0000::/64');
});

test('a limiter lets `points` through per window, then refuses with the time to wait', async () => {
  const limit = limiter('test', 2, 10);
  expect(await limit.take('a')).toEqual({ ok: true });
  expect(await limit.take('a')).toEqual({ ok: true });
  const refused = await limit.take('a');
  expect(refused.ok).toBe(false);
  expect(!refused.ok && refused.retryAfterMs).toBeGreaterThan(0);
  expect(await limit.take('b')).toEqual({ ok: true }); // each key has its own count
  vi.advanceTimersByTime(10_000);
  expect(await limit.take('a')).toEqual({ ok: true });
});

test('only the first refusal in a window is logged', async () => {
  const limit = limiter('test', 1, 10);
  for (let i = 0; i < 4; i++) await limit.take('a');
  expect(log.warn).toHaveBeenCalledTimes(1);
  expect(log.warn).toHaveBeenCalledWith('Rate limited', { limit: 'test', key: 'a' });
});

test('clientIp trusts X-Forwarded-For only as far as the number of proxies', () => {
  const socket = { remoteAddress: '127.0.0.1' };
  const req = { headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.9' }, connection: socket, socket } as unknown as IncomingMessage;
  expect(clientIp(req, 0)).toBe('127.0.0.1');
  expect(clientIp(req, 1)).toBe('203.0.113.9');
  expect(clientIp(req, 2)).toBe('198.51.100.1');
});
