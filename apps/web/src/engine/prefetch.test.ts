import { afterEach, beforeEach, expect, test, vi } from 'vitest';
import { ENGINE_SCRIPT, ENGINE_WASM } from './uci';

beforeEach(() => vi.resetModules()); // prefetch.ts remembers that it ran
afterEach(() => vi.unstubAllGlobals());

test('the engine files are fetched once, at low priority, however often it is asked', async () => {
  const fetch = vi.fn<typeof globalThis.fetch>(async () => new Response());
  vi.stubGlobal('fetch', fetch);
  const { prefetchEngine } = await import('./prefetch');
  prefetchEngine();
  prefetchEngine();
  expect(fetch.mock.calls).toEqual([
    [ENGINE_SCRIPT, { priority: 'low' }],
    [ENGINE_WASM, { priority: 'low' }],
  ]);
});

test('a failed prefetch is swallowed', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
  const { prefetchEngine } = await import('./prefetch');
  expect(() => prefetchEngine()).not.toThrow();
  await new Promise((resolve) => setTimeout(resolve, 0)); // an unhandled rejection would fail the run
});
