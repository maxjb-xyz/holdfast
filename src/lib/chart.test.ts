import { describe, expect, it } from "vitest";
import {
  linePath,
  niceTicks,
  paddedDomain,
  partialStretch,
  rebaseWindow,
  smoothPath,
  splitByPartial,
  type Point,
} from "./chart";

const pts = (values: number[], partialAt: number[] = []): Point[] =>
  values.map((value, i) => ({
    date: `2026-10-${String(i + 1).padStart(2, "0")}`,
    value,
    partial: partialAt.includes(i),
  }));

describe("niceTicks", () => {
  it("uses round steps and always includes zero", () => {
    expect(niceTicks(-0.004, 0.066)).toEqual([0, 0.02, 0.04, 0.06]);
    expect(niceTicks(0.01, 0.03)).toContain(0);
    expect(niceTicks(-0.024, 0.06)).toEqual([-0.02, 0, 0.02, 0.04, 0.06]);
  });

  it("copes with a flat series", () => {
    expect(niceTicks(0, 0)).toContain(0);
  });

  it("never returns an unreasonable number of ticks", () => {
    for (const [lo, hi] of [
      [-0.5, 0.9],
      [0, 0.0003],
      [-0.13, 0.02],
      [0, 3],
    ]) {
      const ticks = niceTicks(lo, hi);
      expect(ticks.length).toBeGreaterThanOrEqual(2);
      expect(ticks.length).toBeLessThanOrEqual(7);
    }
  });
});

describe("paddedDomain", () => {
  it("includes zero and leaves headroom", () => {
    const d = paddedDomain([0.02, 0.06]);
    expect(d.top).toBeGreaterThan(0.06);
    expect(d.bottom).toBeLessThan(0);
  });
  it("keeps a minimum span for a flat league", () => {
    const d = paddedDomain([0, 0]);
    expect(d.top - d.bottom).toBeGreaterThan(0.02);
  });
});

describe("series helpers", () => {
  it("draws a path", () => {
    expect(
      linePath([
        [0, 0],
        [10, 5.25],
      ]),
    ).toBe("M0.0 0.0 L10.0 5.3");
  });

  it("splits a series into joined solid and partial runs", () => {
    const runs = splitByPartial(pts([0, 1, 2, 3, 4, 5], [2, 3]));
    expect(runs.map((r) => [r.partial, r.points.length])).toEqual([
      [false, 2],
      [true, 3],
      [false, 3],
    ]);
    expect(runs[1].points[0]).toEqual(runs[0].points.at(-1));
  });

  it("finds the partial stretch", () => {
    expect(partialStretch(pts([0, 1, 2, 3, 4], [2, 3]))).toEqual({
      from: "2026-10-03",
      to: "2026-10-04",
    });
    expect(partialStretch(pts([0, 1, 2]))).toBeNull();
  });

  it("rebases a window to start at zero", () => {
    const window = rebaseWindow(pts([0, 0.1, 0.21, 0.331]), "2026-10-02");
    expect(window.map((p) => p.date)).toEqual([
      "2026-10-02",
      "2026-10-03",
      "2026-10-04",
    ]);
    expect(window[0].value).toBe(0);
    expect(window[1].value).toBeCloseTo(0.1, 10);
    expect(window[2].value).toBeCloseTo(0.21, 10);
  });

  it("leaves a series that starts inside the window alone", () => {
    expect(rebaseWindow(pts([0, 0.1]), "2026-09-20")).toEqual(pts([0, 0.1]));
  });

  it("turns a series that ended before the window into one flat point", () => {
    expect(rebaseWindow(pts([0, 0.1]), "2026-10-20")).toEqual([
      { date: "2026-10-20", value: 0, partial: false },
    ]);
  });

  it("keeps short runs straight and curves long ones through every point", () => {
    const few: [number, number][] = [
      [0, 0],
      [5, 5],
      [10, 0],
    ];
    expect(smoothPath(few)).toBe(linePath(few));
    const many = Array.from(
      { length: 20 },
      (_, i) => [i * 10, (i % 3) * 4] as [number, number],
    );
    const d = smoothPath(many);
    expect(d.startsWith("M0.0 0.0 C")).toBe(true);
    for (const [x, y] of many.slice(1))
      expect(d).toContain(` ${x.toFixed(1)} ${y.toFixed(1)}`);
  });
});
