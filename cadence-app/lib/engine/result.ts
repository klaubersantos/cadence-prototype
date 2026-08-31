// Ported from cadence-prototype/js/engine.js — every engine function
// returns one of these two shapes so callers (Server Actions) can pass
// the result straight through to the UI without a try/catch dance.
export type Result<T> = { ok: true; value: T } | { ok: false; error: string };

export function ok<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function fail(error: string): Result<never> {
  return { ok: false, error };
}
