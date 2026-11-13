import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { expect, test } from 'vitest';
import { ENGINE_SCRIPT, ENGINE_WASM } from './uci';

// next.config.ts caches /engine/* as immutable for a year: a file there must never change under the same name.
const PUBLIC = fileURLToPath(new URL('../../public', import.meta.url));
const SHA256: Record<string, string> = {
  '/engine/stockfish-19-lite-single.js': 'ccb130d7ff29408531c47d859a49f91d59d4f482d05a53eb1a3231a4f624c91a',
  '/engine/stockfish-19-lite-single.wasm': 'ee4f115bdb2d32cadf96cada104a05b5ec257d7ad6f57582190b49bc71f096de',
};

test('the worker and its WASM are files under /engine/, where the immutable header applies', () => {
  expect(ENGINE_WASM).toBe(ENGINE_SCRIPT.replace(/\.js$/, '.wasm')); // the worker loads the .wasm beside itself
  for (const url of [ENGINE_SCRIPT, ENGINE_WASM]) {
    expect(url).toMatch(/^\/engine\//);
    expect(existsSync(PUBLIC + url), url).toBe(true);
  }
});

test('the engine files are byte for byte the ones browsers cache as immutable', () => {
  expect(Object.keys(SHA256).sort()).toEqual([ENGINE_SCRIPT, ENGINE_WASM].sort());
  for (const [url, hash] of Object.entries(SHA256)) {
    const actual = createHash('sha256').update(readFileSync(PUBLIC + url)).digest('hex');
    expect(actual, `${url} changed: give the new file a new name, then update uci.ts and this test`).toBe(hash);
  }
});
