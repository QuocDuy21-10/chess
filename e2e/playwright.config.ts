import { defineConfig, devices } from '@playwright/test';

try {
  process.loadEnvFile('../apps/server/.env'); // TEST_DATABASE_URL locally; CI sets it in the environment
} catch {
  // no .env: the variables come from the environment
}

const ci = !!process.env.CI;

export default defineConfig({
  testDir: '.',
  timeout: 120_000, // a test may drive two browsers and a whole game; CI draws the scene in software
  workers: 1, // one server and one database for every spec
  retries: ci ? 1 : 0,
  reporter: ci ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: 'http://localhost:3000',
    reducedMotion: 'reduce', // tween.ts then skips every animation
    storageState: '.auth/ann.json', // signed in: a signed-out /me answers 401, which Chromium logs as an error
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    {
      name: 'firefox',
      // CI runners have no GPU: ask Firefox for software WebGL
      use: { ...devices['Desktop Firefox'], launchOptions: { firefoxUserPrefs: { 'webgl.force-enabled': true, 'webgl.disabled': false, 'gfx.webrender.software': true } } },
    },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: [
    {
      command: 'node apps/server/src/index.ts',
      cwd: '..',
      url: 'http://localhost:3001/health',
      reuseExistingServer: !ci,
      env: {
        PORT: '3001',
        DATABASE_URL: process.env.TEST_DATABASE_URL ?? '',
        CLIENT_ORIGIN: 'http://localhost:3000',
        GITHUB_CLIENT_ID: 'e2e', // needed to start; never called
        GITHUB_CLIENT_SECRET: 'e2e',
        TRUST_PROXY: '1', // the web image's Caddy
      },
    },
    {
      // The site's real image (README): one origin for the site and the server, with the real headers and routing.
      // -a stdout: Caddy logs every request to stderr, which would bury the test report. Docker's own errors still show.
      command:
        'docker run --rm --init -a stdout --name chess-e2e-web -p 3000:80 --add-host host.docker.internal:host-gateway -e SERVER_UPSTREAM=host.docker.internal:3001 chess-web:e2e',
      url: 'http://localhost:3000',
      gracefulShutdown: { signal: 'SIGTERM', timeout: 10_000 }, // a killed docker client would leave the container
      reuseExistingServer: !ci,
    },
  ],
});
