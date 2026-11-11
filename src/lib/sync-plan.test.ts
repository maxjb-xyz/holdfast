import { describe, expect, it } from "vitest";
import { planSync, type FetchedAccount, type SyncInput } from "./sync-plan";

const TODAY = "2026-11-11";

function account(over: Partial<FetchedAccount> = {}): FetchedAccount {
  return {
    id: "a1",
    label: "Broker Main",
    isPaper: false,
    connected: true,
    balance: 1000,
    transactionsThrough: TODAY,
    activities: [],
    positions: [],
    ...over,
  };
}

function input(over: Partial<SyncInput> = {}): SyncInput {
  return {
    today: TODAY,
    fetched: [account()],
    storedAccounts: [],
    snapshots: [],
    storedFacts: null,
    pausedSince: null,
    ...over,
  };
}

describe("planSync", () => {
  it("records a balance on the first sync and no return yet", () => {
    const plan = planSync(input());
    expect(plan.snapshots).toEqual([{ accountId: "a1", date: TODAY, balance: 1000 }]);
    expect(plan.returns).toEqual([]);
    expect(plan.accounts[0]).toMatchObject({ countedIfNew: true, connected: true, lastSyncedOn: TODAY });
    expect(plan.pausedSince).toBeNull();
  });

  it("leaves paper accounts out of leagues by default", () => {
    const plan = planSync(input({ fetched: [account({ isPaper: true })] }));
    expect(plan.accounts[0].countedIfNew).toBe(false);
  });

  it("scores the day against yesterday's balance with deposits removed", () => {
    const plan = planSync(
      input({
        fetched: [
          account({
            balance: 1210,
            activities: [{ type: "CONTRIBUTION", date: TODAY, amount: 100, units: 0, symbol: null }],
          }),
        ],
        storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-11-10" }],
        snapshots: [{ accountId: "a1", date: "2026-11-10", balance: 1000 }],
      }),
    );
    expect(plan.returns).toHaveLength(1);
    expect(plan.returns[0]).toMatchObject({ accountId: "a1", date: TODAY, partial: false, weight: 1 });
    expect(plan.returns[0].dailyReturn).toBeCloseTo(0.1, 10);
  });

  it("replaces today's earlier balance instead of comparing against it", () => {
    const plan = planSync(
      input({
        fetched: [account({ balance: 1100 })],
        storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: TODAY }],
        snapshots: [
          { accountId: "a1", date: "2026-11-10", balance: 1000 },
          { accountId: "a1", date: TODAY, balance: 1050 },
        ],
      }),
    );
    expect(plan.returns).toHaveLength(1);
    expect(plan.returns[0].dailyReturn).toBeCloseTo(0.1, 10);
  });

  it("marks the day partial when transactions could not be read", () => {
    const plan = planSync(
      input({
        fetched: [account({ balance: 1100, activities: null })],
        storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-11-10" }],
        snapshots: [{ accountId: "a1", date: "2026-11-10", balance: 1000 }],
      }),
    );
    expect(plan.returns[0].partial).toBe(true);
    expect(plan.facts).toBeNull();
  });

  it("weights accounts by their share of the starting money", () => {
    const plan = planSync(
      input({
        fetched: [account({ balance: 3000 }), account({ id: "a2", balance: 1000 })],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "a2", counted: true, lastSyncedOn: "2026-11-10" },
        ],
        snapshots: [
          { accountId: "a1", date: "2026-11-10", balance: 3000 },
          { accountId: "a2", date: "2026-11-10", balance: 1000 },
        ],
      }),
    );
    const weight = (id: string) => plan.returns.find((r) => r.accountId === id)?.weight;
    expect(weight("a1")).toBeCloseTo(0.75, 10);
    expect(weight("a2")).toBeCloseTo(0.25, 10);
  });

  it("does not snapshot a dropped account and pauses from its last good day", () => {
    const plan = planSync(
      input({
        fetched: [account({ connected: false, activities: null, positions: null })],
        storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-11-08" }],
        snapshots: [{ accountId: "a1", date: "2026-11-08", balance: 1000 }],
      }),
    );
    expect(plan.snapshots).toEqual([]);
    expect(plan.returns).toEqual([]);
    expect(plan.accounts[0]).toMatchObject({ connected: false, lastSyncedOn: "2026-11-08" });
    expect(plan.pausedSince).toBe("2026-11-08");
  });

  it("keeps an existing pause date and lifts it once everything is back", () => {
    const dropped = input({
      fetched: [account({ connected: false })],
      storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-11-08" }],
      pausedSince: "2026-11-05",
    });
    expect(planSync(dropped).pausedSince).toBe("2026-11-05");
    expect(planSync({ ...dropped, fetched: [account()] }).pausedSince).toBeNull();
  });

  it("does not pause for a dropped account the person left out of leagues", () => {
    const plan = planSync(
      input({
        fetched: [account(), account({ id: "a2", connected: false })],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "a2", counted: false, lastSyncedOn: "2026-11-01" },
        ],
      }),
    );
    expect(plan.pausedSince).toBeNull();
  });

  it("pauses when a counted account is no longer listed at all", () => {
    const plan = planSync(
      input({
        fetched: [account()],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "gone", counted: true, lastSyncedOn: "2026-11-09" },
        ],
      }),
    );
    expect(plan.goneAccountIds).toEqual(["gone"]);
    expect(plan.pausedSince).toBe("2026-11-09");
  });

  it("after a long disconnect, puts the whole move on the catch-up day", () => {
    const plan = planSync(
      input({
        fetched: [account({ balance: 1200 })],
        storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-10-01" }],
        snapshots: [{ accountId: "a1", date: "2026-10-01", balance: 1000 }],
      }),
    );
    const total = plan.returns.reduce((acc, r) => acc * (1 + r.dailyReturn), 1) - 1;
    expect(total).toBeCloseTo(0.2, 10);
    expect(plan.returns.every((r) => r.date >= plan.pruneBefore)).toBe(true);
    expect(plan.returns.at(-1)?.date).toBe(TODAY);
  });

  it("freezes last quarter's habits when a new quarter begins", () => {
    const facts = { buyMonths: [], buyDates: [], dividendDates: [], holdings: [], holdingSince: null };
    const plan = planSync(
      input({
        storedFacts: { facts, quarter: "2026-Q3", startPrices: { OLD: 1 }, firstSeen: {} },
        fetched: [
          account({ positions: [{ symbol: "VTI", units: 2, price: 250, cashEquivalent: false }] }),
        ],
      }),
    );
    expect(plan.freeze).toEqual({ quarter: "2026-Q3", facts });
    expect(plan.facts?.quarter).toBe("2026-Q4");
    expect(plan.facts?.startPrices).toEqual({ VTI: 250 });
  });

  it("keeps quarter-start prices and adds holdings first seen mid-quarter", () => {
    const facts = { buyMonths: [], buyDates: [], dividendDates: [], holdings: [], holdingSince: null };
    const plan = planSync(
      input({
        storedFacts: { facts, quarter: "2026-Q4", startPrices: { VTI: 200 }, firstSeen: {} },
        fetched: [
          account({
            positions: [
              { symbol: "VTI", units: 2, price: 250, cashEquivalent: false },
              { symbol: "NEW", units: 1, price: 10, cashEquivalent: false },
            ],
          }),
        ],
      }),
    );
    expect(plan.freeze).toBeNull();
    expect(plan.facts?.startPrices).toEqual({ VTI: 200, NEW: 10 });
    const vti = plan.facts?.facts.holdings.find((h) => h.ticker === "VTI");
    expect(vti?.change).toBeCloseTo(0.25, 10);
  });

  it("builds habits only from counted accounts", () => {
    const plan = planSync(
      input({
        fetched: [
          account({ positions: [{ symbol: "VTI", units: 1, price: 100, cashEquivalent: false }] }),
          account({ id: "a2", positions: [{ symbol: "SECRET", units: 1, price: 100, cashEquivalent: false }] }),
        ],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: null },
          { id: "a2", counted: false, lastSyncedOn: null },
        ],
      }),
    );
    expect(plan.facts?.facts.holdings.map((h) => h.ticker)).toEqual(["VTI"]);
  });

  it("awards badges that are earned, dated inside the quarter", () => {
    const facts = { buyMonths: [], buyDates: [], dividendDates: [], holdings: [], holdingSince: null };
    const plan = planSync(
      input({
        storedFacts: { facts, quarter: "2026-Q4", startPrices: {}, firstSeen: { VTI: "2025-01-15" } },
        fetched: [
          account({
            positions: [{ symbol: "VTI", units: 10, price: 100, cashEquivalent: false }],
          }),
        ],
      }),
    );
    const hold = plan.badges.find((b) => b.key === "one_year_hold");
    expect(hold).toBeDefined();
    expect(hold!.quarter).toBe("2026-Q4");
    expect(hold!.earnedOn >= "2026-10-01" && hold!.earnedOn <= TODAY).toBe(true);
  });

  it("does not award One Year Hold to a holding it has only just seen", () => {
    const plan = planSync(
      input({
        fetched: [
          account({
            positions: [{ symbol: "VTI", units: 10, price: 100, cashEquivalent: false }],
          }),
        ],
      }),
    );
    expect(plan.badges.find((b) => b.key === "one_year_hold")).toBeUndefined();
    expect(plan.facts?.firstSeen).toEqual({ VTI: TODAY });
  });
});
