import type { Request, Response } from 'express';
import { expect, test, vi } from 'vitest';
import { onError } from './http.ts';
import { log } from './log.ts';

// The error handler, called directly with a stand-in response.

function fakeResponse(headersSent = false) {
  const res = {
    headersSent,
    statusCode: 200,
    body: undefined as unknown,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      res.body = body;
      return res;
    },
  };
  return res;
}

test('an error in a handler is logged and answered with a bare 500', () => {
  const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
  const res = fakeResponse();
  const error = new Error('ENOENT: /srv/secret.json');
  onError(error, {} as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBe(500);
  expect(res.body).toEqual({ error: 'internal' }); // the message stays on the server
  expect(logged).toHaveBeenCalledWith('Request failed', error);
  logged.mockRestore();
});

test("a client's mistake keeps its status and is not logged", () => {
  const logged = vi.spyOn(log, 'error').mockImplementation(() => {});
  const res = fakeResponse();
  onError(Object.assign(new Error('request entity too large'), { status: 413 }), {} as Request, res as unknown as Response, vi.fn());
  expect(res.statusCode).toBe(413);
  expect(res.body).toEqual({ error: 'bad-request' });
  expect(logged).not.toHaveBeenCalled();
  logged.mockRestore();
});

test('an error after the response has started is left to Express', () => {
  const next = vi.fn();
  const error = new Error('late');
  onError(error, {} as Request, fakeResponse(true) as unknown as Response, next);
  expect(next).toHaveBeenCalledWith(error);
});
