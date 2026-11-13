import { randomBytes } from 'node:crypto';
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, test } from 'vitest';
import { measure, overBudget } from './bundle-size';

test('overBudget names each size over its budget, and nothing when all fit', () => {
  const budget = { firstLoadKb: 100, totalKb: 200 };
  expect(overBudget({ firstLoadKb: 100, totalKb: 200 }, budget)).toEqual([]);
  expect(overBudget({ firstLoadKb: 101, totalKb: 250 }, budget)).toEqual([
    'firstLoadKb: 101 KB is over the budget of 100 KB',
    'totalKb: 250 KB is over the budget of 200 KB',
  ]);
});

test('measure gzips the first-load chunks of / and every chunk', () => {
  const app = mkdtempSync(join(tmpdir(), 'bundle-'));
  mkdirSync(join(app, '.next/diagnostics'), { recursive: true });
  mkdirSync(join(app, '.next/static/chunks/nested'), { recursive: true });
  writeFileSync(join(app, '.next/static/chunks/first.js'), randomBytes(4096)); // random bytes do not compress
  writeFileSync(join(app, '.next/static/chunks/nested/later.js'), randomBytes(8192));
  writeFileSync(
    join(app, '.next/diagnostics/route-bundle-stats.json'),
    JSON.stringify([{ route: '/', firstLoadChunkPaths: ['.next/static/chunks/first.js'] }]),
  );
  expect(measure(app)).toEqual({ firstLoadKb: 4, totalKb: 12 });
});

test('measure says to build first when there is no build', () => {
  expect(() => measure(mkdtempSync(join(tmpdir(), 'bundle-')))).toThrow('npm run build -w @chess/web');
});
