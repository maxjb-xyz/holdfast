import { describe, expect, it } from "vitest";
import {
  badgeStatuses,
  buyStreak,
  buyingRhythm,
  nextBadge,
  styleLabel,
  type HabitFacts,
} from "./badges";
import { ordinal, signedPercent, ago } from "./format";
import { quarterOf } from "./quarters";

const q4 = quarterOf("2026-11-11");
const facts = (over: Partial<HabitFacts> = {}): HabitFacts => ({
  buyMonths: [],
  buyDates: [],
  dividendDates: [],
  holdings: [],
  holdingSince: null,
  ...over,
});
const status = (f: HabitFacts, asOf: string, key: string) =>
  badgeStatuses(f, q4, asOf).find((s) => s.key === key)!;

describe("One Year Hold", () => {
  it("is earned on the anniversary, not before", () => {
    const f = facts({ holdingSince: "2025-11-12" });
    expect(status(f, "2026-11-11", "one_year_hold")).toMatchObject({
      earned: false,
      remaining: "1 day",
    });
    expect(status(f, "2026-11-12", "one_year_hold").earned).toBe(true);
  });

  it("cannot be earned with no holdings", () => {
    expect(status(facts(), "2026-11-11", "one_year_hold")).toMatchObject({
      earned: false,
      closeness: 0,
    });
  });
});

describe("Never Missed a Month", () => {
  it("needs a buy in each of the quarter's three months", () => {
    const two = facts({ buyMonths: ["2026-10", "2026-11"] });
    expect(status(two, "2026-11-11", "never_missed")).toMatchObject({
      earned: false,
      remaining: "1 buy",
      standing: "2 of 3 months",
    });
    const three = facts({
      buyMonths: ["2026-09", "2026-10", "2026-11", "2026-12"],
    });
    expect(status(three, "2026-12-02", "never_missed").earned).toBe(true);
  });

  it("is out of reach once a month has passed without a buy", () => {
    const f = facts({ buyMonths: ["2026-11"] });
    expect(status(f, "2026-11-11", "never_missed")).toMatchObject({
      earned: false,
      closeness: 0,
      remaining: "Missed Oct",
    });
  });

  it("does not count a buy from another quarter", () => {
    const f = facts({ buyMonths: ["2026-07", "2026-08", "2026-09"] });
    expect(status(f, "2026-10-05", "never_missed").standing).toBe(
      "0 of 3 months",
    );
  });
});

describe("Dividend Collector", () => {
  it("counts only dividends paid in the quarter so far", () => {
    const f = facts({
      dividendDates: ["2026-09-30", "2026-10-02", "2026-11-05", "2026-12-20"],
    });
    expect(status(f, "2026-11-11", "dividend_collector")).toMatchObject({
      earned: false,
      remaining: "1 dividend",
    });
    expect(status(f, "2026-12-20", "dividend_collector").earned).toBe(true);
  });
});

describe("Well Spread", () => {
  const spread = facts({
    holdings: [
      { ticker: "A", share: 0.25, change: null },
      { ticker: "B", share: 0.2, change: null },
    ],
  });
  it("is only awarded on the last day of the quarter", () => {
    expect(status(spread, "2026-11-11", "well_spread")).toMatchObject({
      earned: false,
      remaining: "Hold to Dec 31",
    });
    expect(status(spread, "2026-12-31", "well_spread").earned).toBe(true);
  });

  it("says how far over the limit the largest holding is", () => {
    const heavy = facts({
      holdings: [{ ticker: "VTI", share: 0.31, change: null }],
    });
    expect(status(heavy, "2026-12-31", "well_spread")).toMatchObject({
      earned: false,
      remaining: "6 pts over",
      standing: "31% now",
    });
  });
});

describe("nextBadge", () => {
  it("picks the closest badge that can still be earned", () => {
    const f = facts({
      holdingSince: "2026-06-01",
      buyMonths: ["2026-10", "2026-11"],
      dividendDates: ["2026-10-02"],
    });
    const statuses = badgeStatuses(f, q4, "2026-11-11");
    expect(nextBadge(statuses)?.key).toBe("never_missed");
    expect(nextBadge(statuses, ["never_missed"])?.key).toBe("one_year_hold");
  });

  it("returns nothing when nothing is reachable", () => {
    expect(nextBadge(badgeStatuses(facts(), q4, "2026-11-11"))).toBeNull();
  });
});

describe("buying rhythm", () => {
  const f = facts({
    buyMonths: [
      "2025-12",
      "2026-01",
      "2026-03",
      "2026-05",
      "2026-06",
      "2026-07",
      "2026-08",
      "2026-09",
      "2026-10",
      "2026-11",
    ],
  });
  it("covers the trailing twelve months", () => {
    const rhythm = buyingRhythm(f, "2026-11-11");
    expect(rhythm).toHaveLength(12);
    expect(rhythm[0].month).toBe("2025-12");
    expect(rhythm.at(-1)).toEqual({ month: "2026-11", bought: true });
    expect(rhythm.filter((m) => m.bought)).toHaveLength(10);
  });

  it("counts the streak and forgives the unfinished current month", () => {
    expect(buyStreak(f, "2026-11-11")).toBe(7);
    expect(buyStreak(f, "2026-12-03")).toBe(7);
    expect(buyStreak(f, "2027-01-03")).toBe(0);
  });

  it("labels the style from habits", () => {
    expect(styleLabel(f, "2026-11-11")).toBe("Steady Builder");
    expect(
      styleLabel(facts({ holdingSince: "2024-01-01" }), "2026-11-11"),
    ).toBe("Patient Holder");
    expect(styleLabel(facts(), "2026-11-11")).toBe("Long-Term Investor");
  });
});

describe("format", () => {
  it("formats returns, ordinals and ages", () => {
    expect(signedPercent(0.0482)).toBe("+4.82%");
    expect(signedPercent(-0.0038)).toBe("−0.38%");
    expect(signedPercent(-0.00001)).toBe("+0.00%");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(ordinal)).toEqual([
      "1st",
      "2nd",
      "3rd",
      "4th",
      "11th",
      "12th",
      "13th",
      "21st",
      "22nd",
    ]);
    expect(ago("2026-11-11", "2026-11-11")).toBe("today");
    expect(ago("2026-11-03", "2026-11-11")).toBe("8d");
    expect(ago("2026-10-01", "2026-11-11")).toBe("5w");
  });
});
