import { describe, expect, it } from "vitest";
import {
  DEMO_RIVALS,
  DEMO_VIEWER,
  demoDailyReturn,
  demoLeagueMembers,
  demoMember,
} from "./demo";
import { buildLeagueView } from "./league-view";
import { addDays, quarterOf } from "./quarters";

const q4 = quarterOf("2026-11-11");
const view = (asOf: string) =>
  buildLeagueView({
    members: demoLeagueMembers(quarterOf(asOf), asOf),
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

  it("is flat at weekends and stays within believable daily moves", () => {
    expect(demoDailyReturn(DEMO_RIVALS[0], "2026-11-07")).toBe(0);
    for (const rival of [...DEMO_RIVALS, DEMO_VIEWER]) {
      for (let d = q4.start; d <= q4.end; d = addDays(d, 1)) {
        expect(Math.abs(demoDailyReturn(rival, d))).toBeLessThan(0.03);
      }
    }
  });

  it("never rewrites history as the quarter moves on", () => {
    const early = demoMember(DEMO_RIVALS[0], q4, "2026-10-20").rows;
    const later = demoMember(DEMO_RIVALS[0], q4, "2026-11-11").rows;
    expect(later.slice(0, early.length)).toEqual(early);
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
    const before = row("2026-10-29", "demo-ingrid");
    expect(before).toMatchObject({ paused: false });
    expect(before?.rank).not.toBeNull();
    const after = row("2026-11-11", "demo-ingrid");
    expect(after).toMatchObject({ paused: true, rank: null, move: null });
    expect(after?.score.value).toBeCloseTo(before?.score.value as number);
    expect(after?.series.at(-1)?.date).toBe("2026-10-29");
  });

  it("flags the member with incomplete data as partial but keeps them ranked", () => {
    const hana = row("2026-11-11", "demo-hana");
    expect(hana?.score.partial).toBe(true);
    expect(hana?.rank).not.toBeNull();
    expect(row("2026-10-20", "demo-hana")?.score.partial).toBe(false);
  });

  it("gives everyone else a complete score and a 7 day figure", () => {
    const priya = row("2026-11-11", "demo-priya");
    expect(priya?.score).toMatchObject({ partial: false, daysScored: 42 });
    expect(priya?.week.daysScored).toBe(7);
    expect(priya?.series).toHaveLength(43);
  });

  it("uses a real viewer in place of the demo portfolio", () => {
    const members = demoLeagueMembers(q4, "2026-11-11", {
      userId: "real",
      name: "Maximus",
      joinedOn: "2026-09-01",
      rows: [],
    });
    expect(members.map((m) => m.userId)).not.toContain("demo-you");
    expect(members[0].userId).toBe("real");
  });

  it("works on the first day of a quarter and after it ends", () => {
    const first = view("2027-01-01");
    expect(first.dayOfQuarter).toBe(1);
    expect(first.rows.every((r) => r.move === null)).toBe(true);
    const ended = buildLeagueView({
      members: demoLeagueMembers(q4, "2027-02-01"),
      quarter: q4,
      asOf: "2027-02-01",
    });
    expect(ended.asOf).toBe("2026-12-31");
    expect(ended.dayOfQuarter).toBe(92);
  });
});
