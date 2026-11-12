import { describe, expect, it } from "vitest";
import { alignFlows, backfill, cleanHistory, needsHistory, ACTIVITY_CAP } from "./backfill";
import { chainReturns } from "./scoring";
import type { Activity } from "./sync-math";

const TODAY = "2026-11-11";
const deposit = (date: string, amount: number): Activity => ({
  type: "CONTRIBUTION",
  date,
  amount,
  units: 0,
  symbol: null,
});

describe("cleanHistory", () => {
  it("sorts, keeps one point a day and drops unusable ones", () => {
    const points = cleanHistory(
      [
        { date: "2026-11-03", value: 110 },
        { date: "2026-11-01", value: 100 },
        { date: "2026-11-03", value: 120 },
        { date: "2026-11-02", value: Number.NaN },
        { date: "2026-11-04", value: -5 },
        { date: "not a day", value: 5 },
        { date: "2026-11-12", value: 999 },
        { date: "2024-01-01", value: 50 },
      ],
      TODAY,
    );
    expect(points).toEqual([
      { date: "2026-11-01", balance: 100 },
      { date: "2026-11-03", balance: 120 },
    ]);
  });

  it("starts at the first day the account held anything", () => {
    const points = cleanHistory(
      [
        { date: "2026-11-01", value: 0 },
        { date: "2026-11-02", value: 0 },
        { date: "2026-11-03", value: 500 },
        { date: "2026-11-04", value: 0 },
      ],
      TODAY,
    );
    expect(points.map((p) => p.date)).toEqual(["2026-11-03", "2026-11-04"]);
  });
});

describe("backfill", () => {
  it("chains a history into returns and marks them estimated", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-08", value: 1000 },
        { date: "2026-11-09", value: 1010 },
        { date: "2026-11-10", value: 1020.1 },
      ],
      activities: [],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: null,
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-09", "2026-11-10"]);
    expect(rows.every((r) => r.estimated === true && !r.partial)).toBe(true);
    expect(chainReturns(rows.map((r) => r.dailyReturn))).toBeCloseTo(0.0201, 6);
  });

  it("takes deposits out, so adding money is not a gain", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-08", value: 1000 },
        { date: "2026-11-09", value: 2000 },
        { date: "2026-11-10", value: 2100 },
      ],
      activities: [deposit("2026-11-09", 1000)],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: null,
    });
    expect(rows[0].dailyReturn).toBeCloseTo(0, 9);
    expect(rows[0].flowRate).toBeCloseTo(0.5, 9);
    expect(rows[1].dailyReturn).toBeCloseTo(0.05, 9);
  });

  it("stops at the first recorded balance and prefers the history's own value there", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-07", value: 900 },
        { date: "2026-11-08", value: 990 },
        { date: "2026-11-09", value: 1500 },
      ],
      activities: [],
      transactionsThrough: TODAY,
      today: TODAY,
      // Recorded at a different level from the estimate: no jump may appear.
      joinAt: { date: "2026-11-08", balance: 1200 },
    });
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ date: "2026-11-08", estimated: true });
    expect(rows[0].dailyReturn).toBeCloseTo(0.1, 9);
  });

  it("joins onto the recorded balance when the history ends before it", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-08", value: 1000 },
        { date: "2026-11-09", value: 1000 },
      ],
      activities: [],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: { date: TODAY, balance: 1100 },
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-09", "2026-11-10", TODAY]);
    expect(rows[2].dailyReturn).toBeCloseTo(0.1, 9);
  });

  it("gives nothing when the history is from the recorded day on", () => {
    const { rows } = backfill({
      history: [{ date: TODAY, value: 1000 }],
      activities: [],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: { date: TODAY, balance: 1000 },
    });
    expect(rows).toEqual([]);
  });

  it("marks days after the last settled transaction as partial", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-08", value: 1000 },
        { date: "2026-11-09", value: 1010 },
        { date: "2026-11-10", value: 1020 },
      ],
      activities: [],
      transactionsThrough: "2026-11-09",
      today: TODAY,
      joinAt: null,
    });
    expect(rows.map((r) => r.partial)).toEqual([false, true]);
  });

  it("counts a day with an unvalued transfer or an impossible jump as flat and partial", () => {
    const { rows } = backfill({
      history: [
        { date: "2026-11-06", value: 1000 },
        { date: "2026-11-07", value: 5000 },
        { date: "2026-11-08", value: 5050 },
        { date: "2026-11-09", value: 9000 },
        { date: "2026-11-10", value: 4000 },
      ],
      // Shares moved in with no price or cash amount on the 7th.
      activities: [{ type: "TRANSFER", date: "2026-11-07", amount: 0, units: 40, symbol: "VTI" }],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: null,
    });
    expect(rows.map((r) => [r.date, r.partial])).toEqual([
      ["2026-11-07", true],
      ["2026-11-08", false],
      ["2026-11-09", true],
      ["2026-11-10", true],
    ]);
    expect(rows[0].dailyReturn).toBe(0);
    expect(rows[1].dailyReturn).toBeCloseTo(0.01, 9);
    expect(rows[2].dailyReturn).toBe(0);
    expect(rows[3].dailyReturn).toBe(0);
  });

  it("trusts the history only as far back as a cut-short transaction list reaches", () => {
    const activities: Activity[] = Array.from({ length: ACTIVITY_CAP }, () => ({
      type: "BUY",
      date: "2026-11-09",
      amount: -1,
      units: 1,
      symbol: "VTI",
    }));
    const { rows } = backfill({
      history: [
        { date: "2026-11-07", value: 500 },
        { date: "2026-11-08", value: 1000 },
        { date: "2026-11-09", value: 1000 },
        { date: "2026-11-10", value: 1010 },
      ],
      activities,
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: null,
    });
    expect(rows.map((r) => r.date)).toEqual(["2026-11-10"]);
  });
});

describe("alignFlows", () => {
  const points = [
    { date: "2026-11-06", balance: 1000 },
    { date: "2026-11-07", balance: 1000 },
    { date: "2026-11-08", balance: 1000 },
    { date: "2026-11-09", balance: 2000 },
    { date: "2026-11-10", balance: 2000 },
  ];

  it("moves a deposit to the day the balance shows it arriving", () => {
    // Dated the 8th, but the balance only rises on the 9th.
    const late = alignFlows(points, new Map([["2026-11-08", 1000]]));
    expect([...late]).toEqual([["2026-11-09", 1000]]);
    // Dated the 10th, but the balance rose on the 9th.
    const early = alignFlows(points, new Map([["2026-11-10", 1000]]));
    expect([...early]).toEqual([["2026-11-09", 1000]]);
  });

  it("leaves a deposit that already lines up", () => {
    const flows = alignFlows(points, new Map([["2026-11-09", 1000]]));
    expect([...flows]).toEqual([["2026-11-09", 1000]]);
  });

  it("does not smooth away a real market move next to a small deposit", () => {
    const moved = [
      { date: "2026-11-07", balance: 1000 },
      { date: "2026-11-08", balance: 1030 },
      { date: "2026-11-09", balance: 1100 },
      { date: "2026-11-10", balance: 1100 },
    ];
    // +3% on the 8th is the market. The 30 deposit on the 9th is real too.
    const flows = alignFlows(moved, new Map([["2026-11-09", 30]]));
    expect([...flows]).toEqual([["2026-11-09", 30]]);
  });

  it("keeps the chained return the same when a flow is moved", () => {
    const { rows } = backfill({
      history: points.map((p) => ({ date: p.date, value: p.balance })),
      activities: [deposit("2026-11-08", 1000)],
      transactionsThrough: TODAY,
      today: TODAY,
      joinAt: null,
    });
    expect(rows.every((r) => Math.abs(r.dailyReturn) < 1e-9)).toBe(true);
  });

  it("sums flows across a gap in the history", () => {
    const gappy = [
      { date: "2026-11-01", balance: 1000 },
      { date: "2026-11-05", balance: 1300 },
    ];
    const flows = alignFlows(
      gappy,
      new Map([
        ["2026-11-02", 100],
        ["2026-11-04", 200],
      ]),
    );
    expect([...flows]).toEqual([["2026-11-05", 300]]);
  });
});

describe("needsHistory", () => {
  it("asks for a new account and one never checked", () => {
    expect(needsHistory(undefined, TODAY)).toBe(true);
    expect(needsHistory({ historyCheckedOn: null, historyFrom: null }, TODAY)).toBe(true);
  });
  it("does not ask again once filled, or twice in a day", () => {
    expect(needsHistory({ historyCheckedOn: "2026-01-01", historyFrom: "2025-11-12" }, TODAY)).toBe(false);
    expect(needsHistory({ historyCheckedOn: TODAY, historyFrom: null }, TODAY)).toBe(false);
  });
  it("asks again the next day while the history is still missing", () => {
    expect(needsHistory({ historyCheckedOn: "2026-11-10", historyFrom: null }, TODAY)).toBe(true);
  });
});
