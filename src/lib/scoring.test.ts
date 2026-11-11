import { describe, expect, it } from "vitest";
import { addDays, quarterOf } from "./quarters";
import {
  chainReturns,
  combineAccounts,
  cumulativeSeries,
  dailyReturn,
  firstScoredDate,
  quarterScore,
  rankMoves,
  rankStandings,
  windowScore,
  type DailyReturnRow,
  type Score,
} from "./scoring";

const q4 = quarterOf("2026-11-11");

/** Builds one row per day starting at `from`. */
function days(from: string, returns: number[], partialAt: number[] = []) {
  return returns.map<DailyReturnRow>((r, i) => ({
    date: addDays(from, i),
    dailyReturn: r,
    partial: partialAt.includes(i),
  }));
}

const score = (value: number | null, partial = false): Score => ({
  value,
  partial,
  daysScored: value === null ? 0 : 1,
  daysMissing: 0,
});

describe("dailyReturn", () => {
  it("measures growth against the starting balance", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 1010, netDeposits: 0 }),
    ).toBeCloseTo(0.01);
  });

  it("ignores a deposit", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 6010, netDeposits: 5000 }),
    ).toBeCloseTo(0.01);
  });

  it("ignores a withdrawal", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 490, netDeposits: -500 }),
    ).toBeCloseTo(-0.01);
  });

  it("gives the same return to a small and a large account", () => {
    const small = dailyReturn({
      previousBalance: 500,
      balance: 510,
      netDeposits: 0,
    });
    const large = dailyReturn({
      previousBalance: 5e6,
      balance: 5.1e6,
      netDeposits: 0,
    });
    expect(small).toBeCloseTo(large as number);
  });

  it("has no return without a starting balance", () => {
    expect(
      dailyReturn({ previousBalance: 0, balance: 2000, netDeposits: 2000 }),
    ).toBeNull();
  });
});

describe("chainReturns", () => {
  it("compounds days", () => {
    expect(chainReturns([0.1, 0.1])).toBeCloseTo(0.21);
    expect(chainReturns([0.1, -0.1])).toBeCloseTo(-0.01);
    expect(chainReturns([])).toBe(0);
  });
});

describe("combineAccounts", () => {
  it("weights accounts by their share of the balance", () => {
    const [day] = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0.02, partial: false, weight: 0.75 }],
      [
        {
          date: "2026-10-01",
          dailyReturn: -0.02,
          partial: false,
          weight: 0.25,
        },
      ],
    ]);
    expect(day.dailyReturn).toBeCloseTo(0.01);
    expect(day.partial).toBe(false);
  });

  it("re-weights when only some accounts are in the league", () => {
    const [day] = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0.04, partial: false, weight: 0.1 }],
      [{ date: "2026-10-01", dailyReturn: 0.0, partial: false, weight: 0.3 }],
    ]);
    expect(day.dailyReturn).toBeCloseTo(0.01);
  });

  it("counts accounts equally without weights and carries the partial flag", () => {
    const combined = combineAccounts([
      days("2026-10-01", [0.02, 0.01]),
      days("2026-10-01", [0.0], [0]),
    ]);
    expect(combined.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(combined[0].dailyReturn).toBeCloseTo(0.01);
    expect(combined[0].partial).toBe(true);
    expect(combined[1].dailyReturn).toBeCloseTo(0.01);
  });
});

describe("quarterScore", () => {
  it("scores a founding member from the first day of the quarter", () => {
    const result = quarterScore({
      rows: days("2026-09-29", [0.5, 0.5, 0.01, 0.01, 0.01]),
      quarter: q4,
      joinedOn: "2026-08-01",
      asOf: "2026-10-03",
    });
    expect(result.value).toBeCloseTo(1.01 ** 3 - 1);
    expect(result).toMatchObject({
      partial: false,
      daysScored: 3,
      daysMissing: 0,
    });
  });

  it("scores a late joiner only from the day after they joined", () => {
    expect(firstScoredDate(q4, "2026-11-03")).toBe("2026-11-04");
    const result = quarterScore({
      rows: days("2026-11-01", [0.2, 0.2, 0.2, -0.01, 0.02]),
      quarter: q4,
      joinedOn: "2026-11-03",
      asOf: "2026-11-05",
    });
    expect(result.value).toBeCloseTo(0.99 * 1.02 - 1);
    expect(result.partial).toBe(false);
  });

  it("has no score on the join day itself", () => {
    const result = quarterScore({
      rows: days("2026-11-01", [0.2, 0.2, 0.2]),
      quarter: q4,
      joinedOn: "2026-11-03",
      asOf: "2026-11-03",
    });
    expect(result).toMatchObject({
      value: null,
      partial: false,
      daysScored: 0,
    });
  });

  it("stops at the end of the quarter", () => {
    const result = quarterScore({
      rows: days("2026-12-30", [0.01, 0.01, 0.5]),
      quarter: q4,
      joinedOn: "2026-12-29",
      asOf: "2027-01-15",
    });
    expect(result.value).toBeCloseTo(1.01 ** 2 - 1);
    expect(result.daysMissing).toBe(0);
  });

  it("marks the score partial when a day is flagged", () => {
    const result = quarterScore({
      rows: days("2026-10-01", [0.01, 0.01, 0.01], [1]),
      quarter: q4,
      joinedOn: "2026-01-01",
      asOf: "2026-10-03",
    });
    expect(result.partial).toBe(true);
  });

  it("treats a missing day as flat and partial", () => {
    const rows = days("2026-10-01", [0.01, 0.01, 0.01]).filter(
      (r) => r.date !== "2026-10-02",
    );
    const result = quarterScore({
      rows,
      quarter: q4,
      joinedOn: "2026-01-01",
      asOf: "2026-10-03",
    });
    expect(result.value).toBeCloseTo(1.01 ** 2 - 1);
    expect(result).toMatchObject({
      partial: true,
      daysScored: 2,
      daysMissing: 1,
    });
  });
});

describe("windowScore", () => {
  it("covers an inclusive window, such as the last 7 days", () => {
    const rows = days("2026-11-01", Array(11).fill(0.01));
    const week = windowScore(rows, "2026-11-05", "2026-11-11");
    expect(week.daysScored).toBe(7);
    expect(week.value).toBeCloseTo(1.01 ** 7 - 1);
  });

  it("counts a duplicated day once", () => {
    const rows = [...days("2026-11-01", [0.1]), ...days("2026-11-01", [0.1])];
    expect(windowScore(rows, "2026-11-01", "2026-11-01").value).toBeCloseTo(
      0.1,
    );
  });
});

describe("cumulativeSeries", () => {
  it("starts at zero and holds flat through a gap", () => {
    const rows = days("2026-11-04", [0.1, 0.1, 0.1]).filter(
      (r) => r.date !== "2026-11-05",
    );
    const series = cumulativeSeries(rows, "2026-11-04", "2026-11-06");
    expect(series.map((p) => p.date)).toEqual([
      "2026-11-03",
      "2026-11-04",
      "2026-11-05",
      "2026-11-06",
    ]);
    expect(series[0].value).toBe(0);
    expect(series[1].value).toBeCloseTo(0.1);
    expect(series[2].value).toBeCloseTo(0.1);
    expect(series[2].partial).toBe(true);
    expect(series[3].value).toBeCloseTo(0.21);
  });
});

describe("rankStandings", () => {
  const league = [
    { userId: "h", name: "Hana K.", score: score(0.039, true), paused: false },
    { userId: "i", name: "Ingrid L.", score: score(0.022), paused: true },
    { userId: "p", name: "Priya N.", score: score(0.0641), paused: false },
    { userId: "d", name: "Dele A.", score: score(-0.0038), paused: false },
    { userId: "t", name: "Tomás R.", score: score(0.0513), paused: false },
    { userId: "y", name: "You", score: score(0.0482), paused: false },
  ];

  it("ranks by return and leaves a paused member without a rank", () => {
    const standings = rankStandings(league);
    expect(standings.map((s) => [s.userId, s.rank])).toEqual([
      ["p", 1],
      ["t", 2],
      ["y", 3],
      ["h", 4],
      ["d", 5],
      ["i", null],
    ]);
  });

  it("keeps a partial member ranked and flagged", () => {
    const hana = rankStandings(league).find((s) => s.userId === "h");
    expect(hana).toMatchObject({ rank: 4, score: { partial: true } });
  });

  it("shares a rank when the shown returns are equal", () => {
    const standings = rankStandings([
      { userId: "a", name: "Ana", score: score(0.05001), paused: false },
      { userId: "b", name: "Ben", score: score(0.05004), paused: false },
      { userId: "c", name: "Cy", score: score(0.01), paused: false },
    ]);
    expect(standings.map((s) => [s.name, s.rank])).toEqual([
      ["Ana", 1],
      ["Ben", 1],
      ["Cy", 3],
    ]);
  });

  it("leaves a member with no score yet unranked", () => {
    const standings = rankStandings([
      { userId: "n", name: "New", score: score(null), paused: false },
      { userId: "a", name: "Ana", score: score(-0.2), paused: false },
    ]);
    expect(standings.map((s) => s.rank)).toEqual([1, null]);
  });

  it("reports how far each member moved", () => {
    const earlier = rankStandings(
      league.map((m) => (m.userId === "y" ? { ...m, score: score(0.07) } : m)),
    );
    const moves = rankMoves(rankStandings(league), earlier);
    expect(moves.get("y")).toBe(-2);
    expect(moves.get("p")).toBe(1);
    expect(moves.get("h")).toBe(0);
    expect(moves.get("i")).toBeNull();
  });
});
