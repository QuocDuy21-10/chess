import { ENGINE_SCRIPT, ENGINE_WASM } from './uci';

let done = false;

/**
 * Warms the HTTP cache with the engine (1.8 MB) when a game against the computer becomes likely, so Start finds
 * it there. Two-player and online games never call this. A failure is ignored: the worker fetches it at Start.
 */
export function prefetchEngine(): void {
  if (done) return;
  done = true;
  for (const url of [ENGINE_SCRIPT, ENGINE_WASM]) void fetch(url, { priority: 'low' }).catch(() => {});
}
