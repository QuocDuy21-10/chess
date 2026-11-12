interface Tween {
  elapsed: number;
  ms: number;
  update: (t: number) => void;
  resolve: () => void;
}

const active = new Set<Tween>();

export const reducedMotion = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Calls `update(t)` with t from 0 to 1 over `ms`, driven by tickTweens. Resolves after update(1). */
export function tween(ms: number, update: (t: number) => void): Promise<void> {
  if (ms <= 0 || reducedMotion()) {
    update(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => active.add({ elapsed: 0, ms, update, resolve }));
}

/** Advance every running tween. Called once per frame from the scene. */
export function tickTweens(deltaMs: number): void {
  for (const tw of active) {
    tw.elapsed += deltaMs;
    const t = Math.min(1, tw.elapsed / tw.ms);
    tw.update(t);
    if (t === 1) {
      active.delete(tw);
      tw.resolve();
    }
  }
}
