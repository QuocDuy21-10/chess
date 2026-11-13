import { defineConfig } from 'vitest/config';

try {
  process.loadEnvFile('.env'); // TEST_DATABASE_URL, for local runs; CI sets it in the environment
} catch {
  // no .env: the variables come from the environment
}

export default defineConfig({
  test: {
    globalSetup: ['./vitest.setup.ts'],
    fileParallelism: false, // the files share one database and truncate it
  },
});
