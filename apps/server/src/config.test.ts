import { expect, test } from 'vitest';
import { loadConfig as load } from './config.ts';

const DATABASE_URL = 'postgres://chess:chess@localhost:5432/chess';
const GITHUB = { GITHUB_CLIENT_ID: 'gh-id', GITHUB_CLIENT_SECRET: 'gh-secret' };
/** The variables every server needs, so each test below changes only the one it is about. */
const REQUIRED = { DATABASE_URL, ...GITHUB };
const loadConfig = (env: NodeJS.ProcessEnv) => load({ ...REQUIRED, ...env });
const PRODUCTION = { NODE_ENV: 'production', CLIENT_ORIGIN: 'https://chess.example.com', PUBLIC_URL: 'https://api.chess.example.com' };

test('development defaults when only the required variables are set', () => {
  expect(loadConfig({})).toEqual({
    port: 3001,
    origins: true,
    databaseUrl: DATABASE_URL,
    production: false,
    publicUrl: 'http://localhost:3001',
    webUrl: 'http://localhost:3000',
    oauth: { github: { clientId: 'gh-id', clientSecret: 'gh-secret' } },
  });
  expect(loadConfig({ PORT: '4000' }).publicUrl).toBe('http://localhost:4000');
});

test('DATABASE_URL is required and must be a Postgres URL', () => {
  for (const bad of [undefined, '', 'mysql://localhost/chess', 'localhost:5432']) {
    expect(() => loadConfig({ DATABASE_URL: bad }), String(bad)).toThrow('DATABASE_URL');
  }
  expect(loadConfig({ DATABASE_URL: 'postgresql://h/db' }).databaseUrl).toBe('postgresql://h/db');
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
  expect(() => loadConfig({ ...PRODUCTION, CLIENT_ORIGIN: undefined })).toThrow('CLIENT_ORIGIN');
  expect(() => loadConfig({ ...PRODUCTION, CLIENT_ORIGIN: ' , ' })).toThrow('CLIENT_ORIGIN');
  expect(loadConfig(PRODUCTION).origins).toEqual(['https://chess.example.com']);
});

test('a sign-in returns to the first CLIENT_ORIGIN', () => {
  const config = loadConfig({ ...PRODUCTION, CLIENT_ORIGIN: 'https://chess.example.com, https://www.chess.example.com' });
  expect(config).toMatchObject({ production: true, webUrl: 'https://chess.example.com' });
});

test('PUBLIC_URL is required in production and must be an origin', () => {
  expect(() => loadConfig({ ...PRODUCTION, PUBLIC_URL: undefined })).toThrow('PUBLIC_URL');
  expect(() => loadConfig({ PUBLIC_URL: 'https://api.chess.example.com/' })).toThrow('PUBLIC_URL');
  expect(loadConfig(PRODUCTION).publicUrl).toBe('https://api.chess.example.com');
});

test('each OAuth app needs its id and secret together, and at least one app is needed', () => {
  expect(() => load({ DATABASE_URL })).toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET, or GITHUB');
  expect(() => loadConfig({ GOOGLE_CLIENT_ID: 'g-id' })).toThrow('GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET must be set together');
  expect(() => loadConfig({ GITHUB_CLIENT_SECRET: '' })).toThrow('GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set together');
  const both = loadConfig({ GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' }).oauth;
  expect(Object.keys(both).sort()).toEqual(['github', 'google']);
  expect(load({ DATABASE_URL, GOOGLE_CLIENT_ID: 'g-id', GOOGLE_CLIENT_SECRET: 'g-secret' }).oauth).toEqual({
    google: { clientId: 'g-id', clientSecret: 'g-secret' },
  });
});
