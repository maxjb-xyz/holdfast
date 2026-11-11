import { describe, expect, it } from "vitest";
import {
  DEMO_RIVALS,
  DEMO_VIEWER,
  DEMO_VIEWER_ID,
  demoDailyReturn,
  demoFacts,
  demoLeague,
  demoPlayer,
} from "./demo";
import { buildLeagueView } from "./league-view";
import { addDays, quarterOf, quartersEndingAt } from "./quarters";

const view = (asOf: string) =>
  buildLeagueView({
    members: demoLeague(asOf).members,
    quarter: quarterOf(asOf),
    asOf,
  });
const row = (asOf: string, id: string) =>
  view(asOf).rows.find((r) => r.userId === id);

describe("demo rivals", () => {
  it("gives the same return for the same rival and day, every time", () => {
    const priya = DEMO_RIVALS[0];
    expect(demoDailyReturn(priya, "2026-11-10")).toBe(
      demoDailyReturn(priya, "2026-11-10"),
    );
    expect(demoDailyReturn(priya, "2026-11-10")).not.toBe(
      demoDailyReturn(DEMO_RIVALS[1], "2026-11-10"),
    );
  });

  it("is flat at weekends", () => {
    expect(demoDailyReturn(DEMO_RIVALS[0], "2026-11-07")).toBe(0);
    expect(demoDailyReturn(DEMO_RIVALS[0], "2026-11-08")).toBe(0);
  });

  it("produces quarter returns a patient investor would believe", () => {
    // Twelve years of quarters for every profile.
    const quarters = quartersEndingAt(quarterOf("2032-12-31"), 48);
    for (const profile of [...DEMO_RIVALS, DEMO_VIEWER]) {
      const results = quarters.map((q) => {
        let growth = 1;
        for (let d = q.start; d <= q.end; d = addDays(d, 1)) {
          growth *= 1 + demoDailyReturn(profile, d);
        }
        return growth - 1;
      });
      const mean = results.reduce((a, b) => a + b, 0) / results.length;
      expect(mean).toBeGreaterThan(0.002);
      expect(mean).toBeLessThan(0.045);
      expect(Math.max(...results)).toBeLessThan(0.2);
      expect(Math.min(...results)).toBeGreaterThan(-0.15);
    }
  });

  it("never rewrites history as time moves on", () => {
    const early = demoPlayer(DEMO_RIVALS[0], "2026-10-20").rows;
    const later = demoPlayer(DEMO_RIVALS[0], "2026-11-11").rows;
    expect(later.slice(0, early.length)).toEqual(early);
    const recent = (asOf: string) =>
      demoFacts(DEMO_VIEWER, asOf).buyDates.filter(
        (d) => d >= "2025-01-01" && d <= "2026-11-11",
      );
    expect(recent("2026-11-11")).toEqual(recent("2026-12-30"));
    expect(recent("2026-11-11").length).toBeGreaterThan(10);
  });
});

describe("demo league", () => {
  it("has the viewer and five rivals mid-quarter", () => {
    const league = view("2026-11-11");
    expect(league.rows).toHaveLength(6);
    expect(league.dayOfQuarter).toBe(42);
    expect(league.daysInQuarter).toBe(92);
    const ranks = league.rows.map((r) => r.rank).filter((r) => r !== null);
    expect(ranks).toHaveLength(5);
    expect(ranks[0]).toBe(1);
    expect(league.rows.some((r) => r.userId === DEMO_VIEWER_ID)).toBe(true);
  });

  it("hides the late joiner until they join, then scores them from 0%", () => {
    expect(row("2026-10-20", "demo-dele")).toBeUndefined();
    const joinDay = row("2026-11-03", "demo-dele");
    expect(joinDay).toMatchObject({ rank: null, joinedThisQuarter: true });
    expect(joinDay?.score.value).toBeNull();
    const later = row("2026-11-11", "demo-dele");
    expect(later?.series[0]).toMatchObject({ date: "2026-11-03", value: 0 });
    expect(later?.score.daysScored).toBe(8);
    expect(later?.rank).not.toBeNull();
  });

  it("freezes a paused member and takes away their rank", () => {
    const before = row("2026-11-05", "demo-ingrid");
    expect(before).toMatchObject({ paused: false });
    expect(before?.rank).not.toBeNull();
    for (const day of ["2026-11-06", "2026-11-11", "2026-12-20"]) {
      const after = row(day, "demo-ingrid");
      expect(after).toMatchObject({ paused: true, rank: null, move: null });
      expect(after?.score.value).toBe(before?.score.value);
      expect(after?.series.at(-1)?.date).toBe("2026-11-05");
    }
  });

  it("flags the member with incomplete data as partial but keeps them ranked", () => {
    const hana = row("2026-11-11", "demo-hana");
    expect(hana?.score.partial).toBe(true);
    expect(hana?.rank).not.toBeNull();
    expect(row("2026-10-15", "demo-hana")?.score.partial).toBe(false);
  });

  it("gives everyone else a complete score and a 7 day figure", () => {
    const priya = row("2026-11-11", "demo-priya");
    expect(priya?.score).toMatchObject({ partial: false, daysScored: 42 });
    expect(priya?.week.daysScored).toBe(7);
    expect(priya?.series).toHaveLength(43);
  });

  it("keeps the quarter's events out of earlier quarters", () => {
    const league = demoLeague("2026-11-11");
    const q3 = quarterOf("2026-09-30");
    const past = buildLeagueView({
      members: league.members,
      quarter: q3,
      asOf: q3.end,
    });
    expect(past.rows.map((r) => r.userId)).not.toContain("demo-dele");
    expect(past.rows).toHaveLength(5);
    expect(past.rows.every((r) => r.rank !== null && !r.score.partial)).toBe(
      true,
    );
  });

  it("uses a real viewer in place of the demo portfolio", () => {
    const real = {
      ...demoPlayer(DEMO_VIEWER, "2026-11-11"),
      userId: "real",
      name: "Maximus",
    };
    const members = demoLeague("2026-11-11", real).members;
    expect(members.map((m) => m.userId)).not.toContain(DEMO_VIEWER_ID);
    expect(members[0].userId).toBe("real");
  });

  it("works on the first day of a quarter and on its last", () => {
    const first = view("2027-01-01");
    expect(first.dayOfQuarter).toBe(1);
    expect(first.rows.every((r) => r.move === null)).toBe(true);
    const lastDay = view("2026-12-31");
    expect(lastDay.dayOfQuarter).toBe(92);
    expect(lastDay.rows).toHaveLength(6);
  });

  it("awards badges only on days that have already happened", () => {
    for (const today of [
      "2026-10-01",
      "2026-11-11",
      "2026-12-31",
      "2027-02-14",
    ]) {
      for (const member of demoLeague(today).members) {
        for (const badge of member.earned) {
          expect(badge.on <= today).toBe(true);
          expect(badge.on.length).toBe(10);
        }
      }
    }
  });
});
