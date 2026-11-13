import { expect, test } from 'vitest';
import { loadConfig as load } from './config.ts';

const DATABASE_URL = 'postgres://chess:chess@localhost:5432/chess';
/** Every test below but the DATABASE_URL one is about another variable: give it a valid one. */
const loadConfig = (env: NodeJS.ProcessEnv) => load({ DATABASE_URL, ...env });

test('port 3001 and any origin when nothing else is set', () => {
  expect(loadConfig({})).toEqual({ port: 3001, origins: true, databaseUrl: DATABASE_URL });
});

test('DATABASE_URL is required and must be a Postgres URL', () => {
  for (const bad of [undefined, '', 'mysql://localhost/chess', 'localhost:5432']) {
    expect(() => load({ DATABASE_URL: bad }), String(bad)).toThrow('DATABASE_URL');
  }
  expect(load({ DATABASE_URL: 'postgresql://h/db' }).databaseUrl).toBe('postgresql://h/db');
});

test('PORT is read, and refused unless it is a whole number from 1 to 65535', () => {
  expect(loadConfig({ PORT: '8080' }).port).toBe(8080);
  for (const bad of ['abc', '0', '65536', '30.5', '-1', ' ', '0x50']) {
    expect(() => loadConfig({ PORT: bad }), bad).toThrow('PORT');
  }
});

test('CLIENT_ORIGIN names one origin or several, separated by commas', () => {
  expect(loadConfig({ CLIENT_ORIGIN: 'https://chess.example.com' }).origins).toEqual(['https://chess.example.com']);
  expect(loadConfig({ CLIENT_ORIGIN: 'https://chess.example.com, http://localhost:3000' }).origins).toEqual([
    'https://chess.example.com',
    'http://localhost:3000',
  ]);
});

test('a CLIENT_ORIGIN entry with a trailing slash, a path or no scheme is refused', () => {
  for (const bad of ['https://chess.example.com/', 'https://chess.example.com/play', 'chess.example.com']) {
    expect(() => loadConfig({ CLIENT_ORIGIN: bad }), bad).toThrow(`CLIENT_ORIGIN entry "${bad}"`);
  }
});

test('in production the server refuses to start without CLIENT_ORIGIN', () => {
  expect(() => loadConfig({ NODE_ENV: 'production' })).toThrow('CLIENT_ORIGIN');
  expect(() => loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: ' , ' })).toThrow('CLIENT_ORIGIN');
  expect(loadConfig({ NODE_ENV: 'production', CLIENT_ORIGIN: 'https://chess.example.com' }).origins).toEqual([
    'https://chess.example.com',
  ]);
});
