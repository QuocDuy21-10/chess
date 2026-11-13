import { test as base, expect, type Page } from '@playwright/test';

// Every page a test opens is watched: a page error, a console error or a CSP violation fails the test, and the
// 3D scene must get a WebGL context.

/** Starts recording problems on `page`; returns the list they are added to. */
export function watch(page: Page): string[] {
  const problems: string[] = [];
  page.on('pageerror', (error) => problems.push(`page error: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') problems.push(`console error: ${message.text()}`);
    if (message.text().startsWith('CSP ')) problems.push(message.text());
  });
  return problems;
}

/** Waits for the scene's canvas and checks it has a WebGL context. */
export async function expectWebGL(page: Page) {
  await page.locator('canvas').first().waitFor();
  const webgl = await page.evaluate(() => !!document.querySelector('canvas')?.getContext('webgl2'));
  expect(webgl, 'the canvas has a WebGL2 context').toBe(true);
}

export const test = base.extend<{ problems: string[] }>({
  context: async ({ context }, use) => {
    await context.addInitScript(() =>
      document.addEventListener('securitypolicyviolation', (event) =>
        console.log(`CSP ${event.effectiveDirective} ${event.blockedURI}`),
      ),
    );
    await use(context);
  },
  problems: [
    async ({ page }, use) => {
      const problems = watch(page);
      await use(problems);
      expect(problems, 'problems on the page').toEqual([]);
    },
    { auto: true },
  ],
});

export { expect };

/** Types `move` into the HUD and presses Move. */
export async function typeMove(page: Page, move: string) {
  await page.getByLabel('Type a move').fill(move);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
}

/** The number of moves (plies) in the HUD's move list, which has one row per pair. */
export const moveCount = (page: Page) => page.getByRole('list', { name: 'Moves' }).first().locator('li > span:nth-child(n+2)').count();
