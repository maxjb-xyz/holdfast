import { describe, expect, it } from "vitest";
import { chainReturns } from "./scoring";
import {
  buildFacts,
  currentPrices,
  firstSeenDays,
  flowsByDay,
  netDepositsByDay,
  recomputeWindow,
  weightsFor,
  type Activity,
} from "./sync-math";

const act = (type: string, date: string, over: Partial<Activity> = {}): Activity => ({
  type,
  date,
  amount: 0,
  units: 0,
  symbol: null,
  ...over,
});

describe("netDepositsByDay", () => {
  it("counts contributions, withdrawals and transfers, and nothing else", () => {
    const flows = netDepositsByDay([
      act("CONTRIBUTION", "2026-11-02", { amount: 500 }),
      act("CONTRIBUTION", "2026-11-02", { amount: -250 }), // sign varies by brokerage
      act("WITHDRAWAL", "2026-11-03", { amount: 100 }),
      act("WITHDRAWAL", "2026-11-03", { amount: -40 }),
      act("TRANSFER", "2026-11-04", { amount: -300 }),
      act("DIVIDEND", "2026-11-04", { amount: 12 }),
      act("BUY", "2026-11-04", { amount: -1000 }),
      act("INTEREST", "2026-11-04", { amount: 3 }),
      act("FEE", "2026-11-04", { amount: -1 }),
    ]);
    expect(Object.fromEntries(flows)).toEqual({ "2026-11-02": 750, "2026-11-03": -140, "2026-11-04": -300 });
  });
});

describe("recomputeWindow", () => {
  it("gives one return per day with deposits removed", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-01", balance: 1000 },
        { date: "2026-11-02", balance: 1010 },
        { date: "2026-11-03", balance: 2030.2 },
      ],
      new Map([["2026-11-03", 1000]]),
      "2026-11-03",
    );
    expect(rows.map((r) => r.date)).toEqual(["2026-11-02", "2026-11-03"]);
    expect(rows[0].dailyReturn).toBeCloseTo(0.01, 10);
    expect(rows[1].dailyReturn).toBeCloseTo(20.2 / 2010, 10);
    expect(rows[1].flowRate).toBeCloseTo(1000 / 2010, 10);
    expect(rows.every((r) => !r.partial)).toBe(true);
  });

  it("keeps the chained total exact across a missed sync", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-06", balance: 1000 },
        { date: "2026-11-09", balance: 1030 },
      ],
      new Map(),
      "2026-11-09",
    );
    expect(rows.map((r) => [r.date, r.partial])).toEqual([
      ["2026-11-07", false],
      ["2026-11-08", false],
      ["2026-11-09", false],
    ]);
    expect(chainReturns(rows.map((r) => r.dailyReturn))).toBeCloseTo(0.03, 10);
  });

  it("flags a long silence as partial", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-01", balance: 1000 },
        { date: "2026-11-08", balance: 1010 },
      ],
      new Map(),
      "2026-11-08",
    );
    expect(rows.slice(0, -1).every((r) => r.partial)).toBe(true);
    expect(rows.at(-1)?.partial).toBe(false);
  });

  it("marks days partial until transactions are known through them, then corrects them", () => {
    const snapshots = [
      { date: "2026-11-01", balance: 1000 },
      { date: "2026-11-02", balance: 2010 },
    ];
    // Day one: the deposit has not been reported yet, so the jump looks like a gain.
    const early = recomputeWindow(snapshots, new Map(), "2026-11-01");
    expect(early[0].partial).toBe(true);
    expect(early[0].dailyReturn).toBeGreaterThan(1);
    // Next sync: the deposit shows up and the same day is recomputed.
    const later = recomputeWindow(snapshots, new Map([["2026-11-02", 1000]]), "2026-11-02");
    expect(later[0].partial).toBe(false);
    expect(later[0].dailyReturn).toBeCloseTo(0.005, 10);
  });

  it("treats an unknown transaction date as not yet known", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-01", balance: 1000 },
        { date: "2026-11-02", balance: 1001 },
      ],
      new Map(),
      null,
    );
    expect(rows[0].partial).toBe(true);
  });

  it("is flat and complete for an account that stays empty", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-01", balance: 0 },
        { date: "2026-11-02", balance: 0 },
      ],
      new Map(),
      "2026-11-02",
    );
    expect(rows).toEqual([{ date: "2026-11-02", dailyReturn: 0, flowRate: 0, partial: false }]);
  });

  it("measures a first deposit into an empty account against the deposit", () => {
    const rows = recomputeWindow(
      [
        { date: "2026-11-01", balance: 0 },
        { date: "2026-11-02", balance: 5025 },
      ],
      new Map([["2026-11-02", 5000]]),
      "2026-11-02",
    );
    expect(rows[0].dailyReturn).toBeCloseTo(0.005, 10);
    expect(rows[0].partial).toBe(false);
  });

  it("needs two snapshots and ignores order and duplicates", () => {
    expect(recomputeWindow([{ date: "2026-11-01", balance: 1 }], new Map(), null)).toEqual([]);
    const rows = recomputeWindow(
      [
        { date: "2026-11-02", balance: 1010 },
        { date: "2026-11-01", balance: 1000 },
        { date: "2026-11-02", balance: 1010 },
      ],
      new Map(),
      "2026-11-02",
    );
    expect(rows).toHaveLength(1);
  });
});

describe("weightsFor", () => {
  it("shares out the starting balance", () => {
    const w = weightsFor(new Map([["a", 750], ["b", 250], ["c", 0]]));
    expect(Object.fromEntries(w)).toEqual({ a: 0.75, b: 0.25, c: 0 });
  });
  it("is unknown when nothing was held", () => {
    expect(weightsFor(new Map([["a", 0]])).get("a")).toBeNull();
  });
});

describe("buildFacts", () => {
  const today = "2026-11-11";
  const positions = [
    { symbol: "VTI", units: 10, price: 310, cashEquivalent: false },
    { symbol: "VTI", units: 10, price: 310, cashEquivalent: false }, // second account
    { symbol: "BND", units: 20, price: 90, cashEquivalent: false },
    { symbol: "SPAXX", units: 5000, price: 1, cashEquivalent: true },
  ];

  it("records months with a buy and the first buy of each", () => {
    const facts = buildFacts({
      activities: [
        act("BUY", "2026-10-15", { symbol: "VTI", units: 1 }),
        act("BUY", "2026-10-03", { symbol: "VTI", units: 1 }),
        act("BUY", "2026-11-02", { symbol: "BND", units: 1 }),
        act("REI", "2026-09-28", { symbol: "VTI", units: 0.1 }), // automatic, not a habit
        act("SELL", "2026-08-01", { symbol: "VTI", units: 1 }),
      ],
      positions,
      startPrices: {},
      today,
    });
    expect(facts.buyMonths).toEqual(["2026-10", "2026-11"]);
    expect(facts.buyDates).toEqual(["2026-10-03", "2026-11-02"]);
  });

  it("counts dividends but not reinvestment as a separate dividend", () => {
    const facts = buildFacts({
      activities: [
        act("DIVIDEND", "2026-10-02", { amount: 10 }),
        act("REI", "2026-10-02", { units: 0.03, symbol: "VTI" }),
        act("STOCK_DIVIDEND", "2026-11-05"),
        act("INTEREST", "2026-11-06", { amount: 1 }),
      ],
      positions,
      startPrices: {},
      today,
    });
    expect(facts.dividendDates).toEqual(["2026-10-02", "2026-11-05"]);
  });

  it("turns positions into shares and price changes with no dollar amounts", () => {
    const facts = buildFacts({ activities: [], positions, startPrices: { VTI: 300 }, today });
    expect(facts.holdings.map((h) => h.ticker)).toEqual(["VTI", "BND"]);
    expect(facts.holdings[0].share).toBeCloseTo(6200 / 8000, 10);
    expect(facts.holdings[0].change).toBeCloseTo(310 / 300 - 1, 10);
    expect(facts.holdings[1].change).toBeNull();
    expect(JSON.stringify(facts)).not.toContain("6200");
    expect(JSON.stringify(facts)).not.toContain("5000");
  });

  it("dates a holding from when the current position was opened", () => {
    const facts = buildFacts({
      activities: [
        act("BUY", "2025-01-10", { symbol: "BND", units: 20 }),
        act("BUY", "2024-06-01", { symbol: "VTI", units: 20 }),
        act("SELL", "2025-03-01", { symbol: "VTI", units: 20 }), // sold everything
        act("BUY", "2025-09-01", { symbol: "VTI", units: 12 }), // started again
        act("BUY", "2026-02-01", { symbol: "VTI", units: 8 }),
      ],
      positions,
      startPrices: {},
      today,
    });
    // BND has been held since Jan 2025. VTI's clock restarted in Sep 2025.
    expect(facts.holdingSince).toBe("2025-01-10");
  });

  it("does not assume a holding is older than the evidence for it", () => {
    // Nothing is known about when these were bought: the clock starts today.
    expect(buildFacts({ activities: [], positions, startPrices: {}, today }).holdingSince).toBe(today);
    // An old trade in another holding says nothing about this one.
    const other = buildFacts({
      activities: [act("BUY", "2024-10-01", { symbol: "OLD", units: 1 })],
      positions,
      startPrices: {},
      today,
    });
    expect(other.holdingSince).toBe(today);
    // Evidence carried from earlier syncs.
    const seen = buildFacts({
      activities: [],
      positions,
      startPrices: {},
      firstSeen: { VTI: "2026-03-01", BND: "2026-05-01" },
      today,
    });
    expect(seen.holdingSince).toBe("2026-03-01");
  });

  it("finds the opening trade despite rounding in fractional units", () => {
    const facts = buildFacts({
      activities: [act("BUY", "2026-11-05", { symbol: "VTI", units: 3.33333 })],
      positions: [{ symbol: "VTI", units: 3.3333333, price: 100, cashEquivalent: false }],
      startPrices: {},
      firstSeen: { VTI: "2024-10-01" },
      today,
    });
    expect(facts.holdingSince).toBe("2026-11-05");
  });

  it("carries first-seen days forward, starts new holdings today, and forgets sold ones", () => {
    expect(firstSeenDays(positions, { VTI: "2026-03-01", GONE: "2025-01-01" }, today, { BND: "2024-01-01" })).toEqual({
      VTI: "2026-03-01",
      BND: today,
    });
  });

  it("on a first sync dates holdings from how far the account's history reaches", () => {
    expect(firstSeenDays(positions, null, today, { VTI: "2025-02-01" })).toEqual({
      VTI: "2025-02-01",
      BND: today,
    });
  });

  it("has no holding date without holdings", () => {
    expect(buildFacts({ activities: [], positions: [], startPrices: {}, today }).holdingSince).toBeNull();
  });

  it("lists current prices for the next quarter's baseline", () => {
    expect(currentPrices(positions)).toEqual({ VTI: 310, BND: 90 });
  });
});

describe("flowsByDay", () => {
  it("counts holdings transferred in or out as a flow, valued by units and price", () => {
    const { flows, unclear } = flowsByDay([
      { type: "EXTERNAL_ASSET_TRANSFER_IN", date: "2026-11-03", amount: 0, units: 10, price: 50, symbol: "VTI" },
      { type: "EXTERNAL_ASSET_TRANSFER_OUT", date: "2026-11-04", amount: 0, units: 2, price: 50, symbol: "VTI" },
      { type: "TRANSFER", date: "2026-11-05", amount: 0, units: -4, price: 25, symbol: "BND" },
      { type: "DEPOSIT", date: "2026-11-06", amount: 300, units: 0, symbol: null },
    ]);
    expect(flows.get("2026-11-03")).toBe(500);
    expect(flows.get("2026-11-04")).toBe(-100);
    expect(flows.get("2026-11-05")).toBe(-100);
    expect(flows.get("2026-11-06")).toBe(300);
    expect(unclear.size).toBe(0);
  });

  it("flags a transfer it cannot value, and the day is scored as partial", () => {
    const { flows, unclear } = flowsByDay([
      { type: "TRANSFER", date: "2026-11-10", amount: 0, units: 10, symbol: "VTI" },
    ]);
    expect(flows.size).toBe(0);
    expect([...unclear]).toEqual(["2026-11-10"]);
    const rows = recomputeWindow(
      [
        { date: "2026-11-09", balance: 1000 },
        { date: "2026-11-10", balance: 2000 },
      ],
      flows,
      "2026-11-10",
      unclear,
    );
    expect(rows[0].partial).toBe(true);
  });
});
