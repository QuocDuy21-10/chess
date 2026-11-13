import * as Sentry from '@sentry/node';
import { afterEach, expect, test, vi } from 'vitest';
import { log } from './log.ts';

vi.mock('@sentry/node', () => ({ captureException: vi.fn() }));

const out = vi.spyOn(console, 'log').mockImplementation(() => {});
const err = vi.spyOn(console, 'error').mockImplementation(() => {});
afterEach(() => vi.clearAllMocks());

/** The JSON object the first call to `spy` wrote. */
const written = (spy: typeof out) => JSON.parse(String(spy.mock.calls[0][0]));

test('info writes one JSON line to stdout: time, level, message, fields', () => {
  log.info('Listening', { port: 3001 });
  expect(out).toHaveBeenCalledTimes(1);
  const entry = written(out);
  expect(entry).toEqual({ time: expect.any(String), level: 'info', msg: 'Listening', port: 3001 });
  expect(new Date(entry.time).toISOString()).toBe(entry.time);
  expect(err).not.toHaveBeenCalled();
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('warn writes to stdout and does not reach Sentry', () => {
  log.warn('Postgres connection lost', { message: 'terminated' });
  expect(written(out)).toMatchObject({ level: 'warn', msg: 'Postgres connection lost', message: 'terminated' });
  expect(Sentry.captureException).not.toHaveBeenCalled();
});

test('error writes the message and stack to stderr, and sends the error to Sentry', () => {
  const error = new Error('boom');
  log.error('Request failed', error, { roomId: 'abcd1234' });
  expect(out).not.toHaveBeenCalled();
  const entry = written(err);
  expect(entry).toMatchObject({ level: 'error', msg: 'Request failed', roomId: 'abcd1234', error: { message: 'boom' } });
  expect(entry.error.stack).toContain('boom');
  expect(Sentry.captureException).toHaveBeenCalledWith(error, { extra: { msg: 'Request failed', roomId: 'abcd1234' } });
});

test('a pg-style error keeps its code, and anything else is written as text', () => {
  log.error('Cannot migrate the database', Object.assign(new Error(''), { code: 'ECONNREFUSED' }));
  expect(written(err).error).toMatchObject({ message: '', code: 'ECONNREFUSED' });
  err.mockClear();
  log.error('Cannot start', 'PORT must be a whole number');
  expect(written(err).error).toBe('PORT must be a whole number');
});

test('a field that cannot be serialised does not lose the line', () => {
  const loop: Record<string, unknown> = {};
  loop.self = loop;
  log.info('Odd', { loop, ok: 1 });
  expect(written(out)).toMatchObject({ msg: 'Odd', loop: '[unserializable]', ok: 1 });
});
