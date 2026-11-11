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
/**
 * Gridline values for a set of returns. When the returns span less than
 * `minSpan` the lines cover the widened range the chart is drawn on, so a
 * league's first days do not stack every label on the zero line.
 */
export function domainTicks(
  values: readonly number[],
  minSpan = 0.02,
  target = 4,
): number[] {
  const hi = Math.max(0, ...values);
  const lo = Math.min(0, ...values);
  const extra = Math.max(0, minSpan - (hi - lo)) / 2;
  return niceTicks(lo - extra, hi + extra, target);
}

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
 * Keeps the part of a series from `origin` onward and restarts it from 0% on
 * that day, so a month or week view shows only what happened in the window.
 * A series that ended before the window (a paused member) becomes a single
 * flat point at the window's start.
 */
export function rebaseWindow(
  points: readonly Point[],
  origin: string,
): Point[] {
  if (points.length === 0) return [];
  const before = points.filter((p) => p.date <= origin);
  const inside = points.filter((p) => p.date > origin);
  // Started inside the window: already begins at 0% on its first day.
  if (before.length === 0) return [...points];
  const base = 1 + before[before.length - 1].value;
  return [
    { date: origin, value: 0, partial: false },
    ...inside.map((p) => ({ ...p, value: (1 + p.value) / base - 1 })),
  ];
}

/**
 * A gently rounded path through every point (Catmull-Rom, drawn as cubic
 * curves). The line still passes through each day's real value.
 */
export function smoothPath(
  points: readonly (readonly [number, number])[],
  tension = 0.18,
  minPoints = 16,
): string {
  // Short runs stay straight: with few points a curve only adds wobble.
  if (points.length < minPoints) return linePath(points);
  const f = (n: number) => n.toFixed(1);
  let d = `M${f(points[0][0])} ${f(points[0][1])}`;
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];
    const c1 = [
      p1[0] + (p2[0] - p0[0]) * tension,
      p1[1] + (p2[1] - p0[1]) * tension,
    ];
    const c2 = [
      p2[0] - (p3[0] - p1[0]) * tension,
      p2[1] - (p3[1] - p1[1]) * tension,
    ];
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`;
  }
  return d;
}

/**
 * Keeps every `step`th point plus the last, for drawing a long series in a
 * small space. A kept point is partial if any point it stands for was.
 */
export function thin(points: readonly Point[], step: number): Point[] {
  if (step <= 1 || points.length <= step + 1) return [...points];
  const kept: Point[] = [];
  let partial = false;
  points.forEach((p, i) => {
    partial ||= p.partial;
    if (i % step === 0 || i === points.length - 1) {
      kept.push({ ...p, partial: i === 0 ? false : partial });
      partial = false;
    }
  });
  return kept;
}
