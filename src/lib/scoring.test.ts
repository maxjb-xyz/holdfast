import { describe, expect, it } from "vitest";
import { addDays, quarterOf } from "./quarters";
import {
  chainReturns,
  combineAccounts,
  cumulativeSeries,
  dailyReturn,
  flowRate,
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
    ).toBeCloseTo(0.01, 8);
  });

  it("ignores a deposit", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 6060, netDeposits: 5000 }),
    ).toBeCloseTo(0.01, 8);
  });

  it("ignores a withdrawal", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 490, netDeposits: -500 }),
    ).toBeCloseTo(-0.01, 8);
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
    expect(small).toBeCloseTo(large as number, 8);
  });

  it("measures a first deposit into an empty account against the deposit", () => {
    expect(
      dailyReturn({ previousBalance: 0, balance: 2010, netDeposits: 2000 }),
    ).toBeCloseTo(0.005, 8);
  });

  it("does not turn a deposit into a tiny account into a huge gain", () => {
    expect(
      dailyReturn({
        previousBalance: 1,
        balance: 10101.01,
        netDeposits: 10000,
      }),
    ).toBeCloseTo(0.01, 4);
  });

  it("has no return when there is nothing to measure against", () => {
    expect(
      dailyReturn({ previousBalance: 0, balance: 0, netDeposits: 0 }),
    ).toBeNull();
    expect(
      dailyReturn({ previousBalance: 0.01, balance: 0.02, netDeposits: 0 }),
    ).toBeNull();
    expect(
      dailyReturn({ previousBalance: -5, balance: 10, netDeposits: 0 }),
    ).toBeNull();
  });

  it("rejects unusable numbers and caps a loss at -100%", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: NaN, netDeposits: 0 }),
    ).toBeNull();
    expect(
      dailyReturn({ previousBalance: 1000, balance: 1, netDeposits: Infinity }),
    ).toBeNull();
    expect(
      dailyReturn({ previousBalance: 1000, balance: -500, netDeposits: 0 }),
    ).toBe(-1);
  });

  it("handles a withdrawal that empties the account", () => {
    expect(
      dailyReturn({ previousBalance: 1000, balance: 0, netDeposits: -1010 }),
    ).toBeCloseTo(0.01, 8);
  });

  it("reports deposits as a share of the same base", () => {
    expect(flowRate({ previousBalance: 1000, netDeposits: 1000 })).toBeCloseTo(
      0.5,
      8,
    );
    expect(flowRate({ previousBalance: 1000, netDeposits: -100 })).toBeCloseTo(
      -0.1,
      8,
    );
    expect(flowRate({ previousBalance: 0, netDeposits: 0 })).toBe(0);
  });
});

describe("chainReturns", () => {
  it("compounds days", () => {
    expect(chainReturns([0.1, 0.1])).toBeCloseTo(0.21, 8);
    expect(chainReturns([0.1, -0.1])).toBeCloseTo(-0.01, 8);
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
    expect(day.dailyReturn).toBeCloseTo(0.01, 8);
    expect(day.partial).toBe(false);
  });

  it("re-weights when only some accounts are in the league", () => {
    const [day] = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0.04, partial: false, weight: 0.1 }],
      [{ date: "2026-10-01", dailyReturn: 0.0, partial: false, weight: 0.3 }],
    ]);
    expect(day.dailyReturn).toBeCloseTo(0.01, 8);
  });

  it("counts accounts equally without weights and carries the partial flag", () => {
    const combined = combineAccounts([
      days("2026-10-01", [0.02, 0.01]),
      days("2026-10-01", [0.0], [0]),
    ]);
    expect(combined.map((d) => d.date)).toEqual(["2026-10-01", "2026-10-02"]);
    expect(combined[0].dailyReturn).toBeCloseTo(0.01, 8);
    expect(combined[0].partial).toBe(true);
    expect(combined[1].dailyReturn).toBeCloseTo(0.005, 8);
    expect(combined[1].partial).toBe(true);
  });
});

describe("combineAccounts gaps and weights", () => {
  it("counts a silent account as flat at its last weight and marks the day partial", () => {
    const combined = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0, partial: false, weight: 0.9 }],
      [
        { date: "2026-10-01", dailyReturn: 0, partial: false, weight: 0.1 },
        { date: "2026-10-02", dailyReturn: 0.1, partial: false, weight: 0.1 },
      ],
    ]);
    expect(combined[1].dailyReturn).toBeCloseTo(0.01, 8);
    expect(combined[1].partial).toBe(true);
  });

  it("does not count an account before its first day", () => {
    const combined = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0.02, partial: false, weight: 1 }],
      [{ date: "2026-10-02", dailyReturn: 0.04, partial: false, weight: 0.5 }],
    ]);
    expect(combined[0]).toMatchObject({ dailyReturn: 0.02, partial: false });
  });

  it("falls back to equal weights when any weight is unknown", () => {
    const [day] = combineAccounts([
      [{ date: "2026-10-01", dailyReturn: 0.1, partial: false, weight: null }],
      [{ date: "2026-10-01", dailyReturn: 0, partial: false, weight: 0.5 }],
    ]);
    expect(day.dailyReturn).toBeCloseTo(0.05, 8);
  });

  it("blends deposit rates with the same weights", () => {
    const [day] = combineAccounts([
      [
        {
          date: "2026-10-01",
          dailyReturn: 0,
          partial: false,
          weight: 0.75,
          flowRate: 0.04,
        },
      ],
      [{ date: "2026-10-01", dailyReturn: 0, partial: false, weight: 0.25 }],
    ]);
    expect(day.flowRate).toBeCloseTo(0.03, 8);
  });
});

describe("quarterScore", () => {
  it("treats someone who joins on the first day like any other joiner", () => {
    expect(firstScoredDate(q4, "2026-10-01")).toBe("2026-10-02");
    expect(firstScoredDate(q4, "2026-09-30")).toBe("2026-10-01");
  });

  it("scores a founding member from the first day of the quarter", () => {
    const result = quarterScore({
      rows: days("2026-09-29", [0.5, 0.5, 0.01, 0.01, 0.01]),
      quarter: q4,
      joinedOn: "2026-08-01",
      asOf: "2026-10-03",
    });
    expect(result.value).toBeCloseTo(1.01 ** 3 - 1, 8);
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
    expect(result.value).toBeCloseTo(0.99 * 1.02 - 1, 8);
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
    expect(result.value).toBeCloseTo(1.01 ** 2 - 1, 8);
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
    expect(result.value).toBeCloseTo(1.01 ** 2 - 1, 8);
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
    expect(week.value).toBeCloseTo(1.01 ** 7 - 1, 8);
  });

  it("keeps the score and the chart line in step on a duplicated day", () => {
    const rows = [
      { date: "2026-11-01", dailyReturn: 0.1, partial: false },
      { date: "2026-11-01", dailyReturn: 0.5, partial: true },
    ];
    const s = windowScore(rows, "2026-11-01", "2026-11-01");
    const line = cumulativeSeries(rows, "2026-11-01", "2026-11-01");
    expect(s.value).toBeCloseTo(0.1, 8);
    expect(line.at(-1)).toMatchObject({ partial: false });
    expect(line.at(-1)?.value).toBeCloseTo(0.1, 8);
  });

  it("counts a duplicated day once", () => {
    const rows = [...days("2026-11-01", [0.1]), ...days("2026-11-01", [0.1])];
    expect(windowScore(rows, "2026-11-01", "2026-11-01").value).toBeCloseTo(
      0.1,
      8,
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
    expect(series[1].value).toBeCloseTo(0.1, 8);
    expect(series[2].value).toBeCloseTo(0.1, 8);
    expect(series[2].partial).toBe(true);
    expect(series[3].value).toBeCloseTo(0.21, 8);
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

  it("ties exactly when the displayed figures match", () => {
    const standings = rankStandings([
      { userId: "a", name: "Ana", score: score(0.01005), paused: false },
      { userId: "b", name: "Ben", score: score(0.01), paused: false },
      { userId: "c", name: "Cy", score: score(0.010049999), paused: false },
    ]);
    const shownAs = (v: number) => (v * 100).toFixed(2);
    for (const a of standings)
      for (const b of standings)
        expect(a.rank === b.rank).toBe(
          shownAs(a.score.value as number) === shownAs(b.score.value as number),
        );
  });

  it("keeps a broken score from scrambling everyone else", () => {
    const standings = rankStandings([
      { userId: "a", name: "A", score: score(0.01), paused: false },
      { userId: "b", name: "B", score: score(NaN), paused: false },
      { userId: "c", name: "C", score: score(0.05), paused: false },
      { userId: "d", name: "D", score: score(0.03), paused: false },
    ]);
    expect(standings.map((s) => [s.userId, s.rank])).toEqual([
      ["c", 1],
      ["d", 2],
      ["a", 3],
      ["b", null],
    ]);
  });

  it("does not report a move when someone else pauses or joins", () => {
    const base = [
      { userId: "a", name: "A", score: score(0.05), paused: false },
      { userId: "b", name: "B", score: score(0.03), paused: false },
      { userId: "c", name: "C", score: score(0.1), paused: false },
    ];
    const now = rankStandings(
      base.map((m) => (m.userId === "c" ? { ...m, paused: true } : m)),
    );
    const moves = rankMoves(now, rankStandings(base));
    expect(moves.get("a")).toBe(0);
    expect(moves.get("b")).toBe(0);
    expect(moves.get("c")).toBeNull();
    const joined = rankStandings([
      ...base,
      { userId: "d", name: "D", score: score(0.2), paused: false },
    ]);
    expect(rankMoves(joined, rankStandings(base)).get("a")).toBe(0);
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
