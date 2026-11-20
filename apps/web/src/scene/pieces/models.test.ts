import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import type { PieceSymbol } from 'chess.js';
import { expect, test } from 'vitest';
import { MODELS } from './models';

// next.config.ts caches /models/* as immutable for a year, so a changed model gets a new name: <piece>-<n>.glb.
const PUBLIC = fileURLToPath(new URL('../../../public', import.meta.url));
const NAMES: Record<PieceSymbol, string> = { p: 'pawn', n: 'knight', b: 'bishop', r: 'rook', q: 'queen', k: 'king' };
const KB = 1024;

/** The JSON chunk of a binary glTF file: the scene description, without the binary buffers. */
function glbJson(file: Buffer): { animations?: { name?: string }[] } {
  if (file.readUInt32LE(0) !== 0x46546c67) throw new Error('not a binary glTF file');
  if (file.readUInt32LE(16) !== 0x4e4f534a) throw new Error('the first chunk is not JSON');
  return JSON.parse(file.toString('utf8', 20, 20 + file.readUInt32LE(12)));
}

/** A minimal binary glTF file holding `json`, to test the reader. */
function glb(json: object): Buffer {
  const text = Buffer.from(JSON.stringify(json));
  const chunk = Buffer.concat([text, Buffer.alloc((4 - (text.length % 4)) % 4, 0x20)]);
  const header = Buffer.alloc(20);
  header.writeUInt32LE(0x46546c67, 0); // "glTF"
  header.writeUInt32LE(2, 4);
  header.writeUInt32LE(20 + chunk.length, 8);
  header.writeUInt32LE(chunk.length, 12);
  header.writeUInt32LE(0x4e4f534a, 16); // "JSON"
  return Buffer.concat([header, chunk]);
}

const listed = Object.entries(MODELS) as [PieceSymbol, NonNullable<(typeof MODELS)[PieceSymbol]>][];
const dir = `${PUBLIC}/models`;
const onDisk = existsSync(dir) ? readdirSync(dir).filter((file) => file.endsWith('.glb')) : [];

test('glbJson reads the JSON chunk of a binary glTF file', () => {
  expect(glbJson(glb({ animations: [{ name: 'Walk' }] })).animations?.[0].name).toBe('Walk');
  expect(() => glbJson(Buffer.from('not a model, just text'))).toThrow('not a binary glTF file');
});

test('every listed model is on disk under its versioned name, and every model on disk is listed', () => {
  for (const [type, { url }] of listed) {
    expect(url).toMatch(new RegExp(`^/models/${NAMES[type]}-\\d+\\.glb$`));
    expect(existsSync(PUBLIC + url), url).toBe(true);
  }
  expect([...onDisk].sort()).toEqual(listed.map(([, { url }]) => url.slice('/models/'.length)).sort());
});

test('models stay small: 600 KB each, 3.5 MB in all', () => {
  const sizes = onDisk.map((file) => statSync(`${dir}/${file}`).size);
  sizes.forEach((size, i) => expect(size, onDisk[i]).toBeLessThanOrEqual(600 * KB));
  expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThanOrEqual(3.5 * KB * KB);
});

test('every listed clip is an animation in its file', () => {
  for (const [, { url, clips }] of listed) {
    if (!clips) continue;
    const names = (glbJson(readFileSync(PUBLIC + url)).animations ?? []).map((animation) => animation.name);
    for (const name of Object.values(clips)) expect(names, `${url} has no clip named ${name}`).toContain(name);
  }
});

test('every model is a character: its clips include the hit', () => {
  for (const [, { url, clips }] of listed) expect(clips?.hit, url).toBe('hit');
});
