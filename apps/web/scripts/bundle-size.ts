import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

// After `next build`: the gzip size of the JavaScript `/` loads first, and of all client JavaScript, against
// bundle-budget.json. Raising a budget means editing that file, in the pull request where review sees it.

export interface Sizes {
  firstLoadKb: number;
  totalKb: number;
}

const gzipKb = (files: string[]) =>
  Math.round(files.reduce((sum, file) => sum + gzipSync(readFileSync(file)).length, 0) / 1024);

/** Measures the build in `appDir` (apps/web). */
export function measure(appDir: string): Sizes {
  const statsFile = join(appDir, '.next/diagnostics/route-bundle-stats.json');
  let stats: { route: string; firstLoadChunkPaths: string[] }[];
  try {
    stats = JSON.parse(readFileSync(statsFile, 'utf8'));
  } catch {
    throw new Error(`Cannot read ${statsFile}: run \`npm run build -w @chess/web\` first`);
  }
  const home = stats.find((entry) => entry.route === '/');
  if (!home?.firstLoadChunkPaths.length) throw new Error('The build lists no first-load chunks for /');
  const chunks = join(appDir, '.next/static/chunks');
  const all = readdirSync(chunks, { recursive: true, encoding: 'utf8' })
    .filter((file) => file.endsWith('.js'))
    .map((file) => join(chunks, file));
  return { firstLoadKb: gzipKb(home.firstLoadChunkPaths.map((path) => join(appDir, path))), totalKb: gzipKb(all) };
}

/** One line for each size over its budget; empty when everything fits. */
export function overBudget(sizes: Sizes, budget: Sizes): string[] {
  return (Object.keys(budget) as (keyof Sizes)[])
    .filter((key) => sizes[key] > budget[key])
    .map((key) => `${key}: ${sizes[key]} KB is over the budget of ${budget[key]} KB`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const appDir = fileURLToPath(new URL('..', import.meta.url));
  const budget: Sizes = JSON.parse(readFileSync(join(appDir, 'bundle-budget.json'), 'utf8'));
  const sizes = measure(appDir);
  console.table({
    'first load of /': { gzipKb: sizes.firstLoadKb, budgetKb: budget.firstLoadKb },
    'all JavaScript': { gzipKb: sizes.totalKb, budgetKb: budget.totalKb },
  });
  const over = overBudget(sizes, budget);
  for (const line of over) console.error(line);
  process.exit(over.length ? 1 : 0);
}
