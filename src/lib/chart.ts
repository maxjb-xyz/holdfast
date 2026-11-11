/** Geometry helpers for the SVG charts. Pure, so they can be tested. */

export type Point = { date: string; value: number; partial: boolean };

/** Round tick values that cover [min, max], always including zero. */
export function niceTicks(min: number, max: number, target = 4): number[] {
  const lo = Math.min(min, 0);
  const hi = Math.max(max, 0);
  const span = hi - lo || 0.01;
  const rough = span / target;
  const power = 10 ** Math.floor(Math.log10(rough));
  const step =
    [1, 2, 5, 10].map((m) => m * power).find((s) => span / s <= target + 1) ??
    10 * power;
  const ticks: number[] = [];
  for (let i = Math.ceil(lo / step - 1e-9); i * step <= hi + 1e-9; i++) {
    ticks.push(Number((i * step).toFixed(10)));
  }
  return ticks;
}

/** A y-domain with headroom so lines never touch the frame. */
export function paddedDomain(
  values: readonly number[],
  minSpan = 0.02,
): { top: number; bottom: number } {
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const span = Math.max(hi - lo, minSpan);
  const extra = (span - (hi - lo)) / 2;
  return { top: hi + extra + span * 0.14, bottom: lo - extra - span * 0.14 };
}

export function linePath(
  points: readonly (readonly [number, number])[],
): string {
  return points
    .map(([x, y], i) => `${i === 0 ? "M" : "L"}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join(" ");
}

/**
 * Splits a series into solid and partial stretches for drawing. Neighbouring
 * stretches share their boundary point so the line has no gaps.
 */
export function splitByPartial(
  points: readonly Point[],
): { partial: boolean; points: Point[] }[] {
  const runs: { partial: boolean; points: Point[] }[] = [];
  for (let i = 1; i < points.length; i++) {
    const partial = points[i].partial;
    const last = runs[runs.length - 1];
    if (last && last.partial === partial) last.points.push(points[i]);
    else runs.push({ partial, points: [points[i - 1], points[i]] });
  }
  return runs;
}

/** The first and last day of the longest partial stretch, if there is one. */
export function partialStretch(
  points: readonly Point[],
): { from: string; to: string } | null {
  let best: Point[] = [];
  for (const run of splitByPartial(points)) {
    const days = run.points.slice(1);
    if (run.partial && days.length > best.length) best = days;
  }
  return best.length > 0
    ? { from: best[0].date, to: best[best.length - 1].date }
    : null;
}

/**
 * Keeps the last `days` days of a series and restarts it from 0%, so a month
 * or week view shows only what happened inside that window.
 */
export function rebaseWindow(points: readonly Point[], days: number): Point[] {
  if (points.length <= days + 1) return [...points];
  const window = points.slice(-(days + 1));
  const base = 1 + window[0].value;
  return window.map((p, i) => ({
    date: p.date,
    value: (1 + p.value) / base - 1,
    partial: i === 0 ? false : p.partial,
  }));
}
