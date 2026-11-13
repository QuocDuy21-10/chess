import { defineConfig } from 'vitest/config';
import { fileURLToPath } from 'node:url';

try {
  // TEST_DATABASE_URL for online.test.ts, which runs the real game server. CI sets it in the environment.
  process.loadEnvFile(fileURLToPath(new URL('../server/.env', import.meta.url)));
} catch {
  // no .env: the variables come from the environment
}

export default defineConfig({
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  test: { environment: 'node' },
});
