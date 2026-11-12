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

  it("stops counting an account its owner removed, instead of pausing for good", () => {
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
    expect(plan.forgetAccountIds).toEqual([]);
    expect(plan.pausedSince).toBeNull();
  });

  it("forgets an unlisted account that never synced a balance", () => {
    const plan = planSync(
      input({
        fetched: [account()],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: null },
          { id: "bank", counted: true, lastSyncedOn: null },
        ],
      }),
    );
    expect(plan.forgetAccountIds).toEqual(["bank"]);
    expect(plan.goneAccountIds).toEqual([]);
  });

  it("keeps following a closed account that has history, and skips one that has none", () => {
    const plan = planSync(
      input({
        fetched: [
          account(),
          account({ id: "old", closed: true, balance: 0 }),
          account({ id: "dead", closed: true, balance: 0 }),
          account({ id: "stale", closed: true, balance: 0 }),
        ],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "old", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "stale", counted: true, lastSyncedOn: null },
        ],
      }),
    );
    expect(plan.accounts.map((a) => a.id)).toEqual(["a1", "old"]);
    expect(plan.snapshots.map((s) => s.accountId)).toEqual(["a1", "old"]);
    expect(plan.goneAccountIds).toEqual([]);
    expect(plan.forgetAccountIds).toEqual(["stale"]);
  });

  it("does not treat an account that was listed but not read as removed", () => {
    const plan = planSync(
      input({
        fetched: [account()],
        listedIds: ["a1", "a9"],
        storedAccounts: [
          { id: "a1", counted: true, lastSyncedOn: "2026-11-10" },
          { id: "a9", counted: true, lastSyncedOn: "2026-11-10" },
        ],
      }),
    );
    expect(plan.goneAccountIds).toEqual([]);
  });

  it("never rewrites settled days when transactions cannot be read", () => {
    // Nov 9 had a 1000 deposit and was scored 0% while transactions were readable.
    const base = {
      storedAccounts: [{ id: "a1", counted: true, lastSyncedOn: "2026-11-10" }],
      snapshots: [
        { accountId: "a1", date: "2026-11-08", balance: 1000 },
        { accountId: "a1", date: "2026-11-09", balance: 2000 },
        { accountId: "a1", date: "2026-11-10", balance: 2000 },
      ],
    };
    const dropped = planSync(
      input({ ...base, fetched: [account({ connected: false, activities: null, positions: null })] }),
    );
    expect(dropped.returns).toEqual([]);
    const unread = planSync(input({ ...base, fetched: [account({ balance: 2020, activities: null })] }));
    expect(unread.returns.map((r) => r.date)).toEqual([TODAY]);
    expect(unread.returns[0].partial).toBe(true);
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

  it("awards One Year Hold once, not again every quarter", () => {
    const facts = { buyMonths: [], buyDates: [], dividendDates: [], holdings: [], holdingSince: null };
    const plan = planSync(
      input({
        heldBadges: ["one_year_hold"],
        storedFacts: { facts, quarter: "2026-Q4", startPrices: {}, firstSeen: { VTI: "2025-01-15" } },
        fetched: [
          account({ positions: [{ symbol: "VTI", units: 10, price: 100, cashEquivalent: false }] }),
        ],
      }),
    );
    expect(plan.badges.find((b) => b.key === "one_year_hold")).toBeUndefined();
  });

  it("settles last quarter's badges with dividends that arrived after it closed", () => {
    const stored = {
      buyMonths: [],
      buyDates: [],
      dividendDates: ["2026-07-10", "2026-08-10"],
      holdings: [{ ticker: "VTI", share: 1, change: 0.01 }],
      holdingSince: "2026-06-01",
    };
    const plan = planSync(
      input({
        today: "2026-10-01",
        storedFacts: { facts: stored, quarter: "2026-Q3", startPrices: {}, firstSeen: { VTI: "2026-06-01" } },
        fetched: [
          account({
            transactionsThrough: "2026-10-01",
            activities: [
              { type: "DIVIDEND", date: "2026-07-10", amount: 5, units: 0, symbol: "VTI" },
              { type: "DIVIDEND", date: "2026-08-10", amount: 5, units: 0, symbol: "VTI" },
              { type: "DIVIDEND", date: "2026-09-29", amount: 5, units: 0, symbol: "VTI" },
              { type: "DIVIDEND", date: "2026-10-01", amount: 5, units: 0, symbol: "VTI" },
            ],
            positions: [{ symbol: "VTI", units: 10, price: 100, cashEquivalent: false }],
          }),
        ],
      }),
    );
    expect(plan.freeze?.quarter).toBe("2026-Q3");
    expect(plan.freeze?.facts.dividendDates).toEqual(["2026-07-10", "2026-08-10", "2026-09-29"]);
    expect(plan.freeze?.facts.holdings).toEqual(stored.holdings);
    const collector = plan.badges.find((b) => b.key === "dividend_collector");
    expect(collector).toMatchObject({ quarter: "2026-Q3", earnedOn: "2026-09-29" });
    expect(plan.badges.some((b) => b.quarter === "2026-Q4" && b.key === "dividend_collector")).toBe(false);
  });

  it("on a first sync dates a holding from how far its own account's history reaches", () => {
    const plan = planSync(
      input({
        fetched: [
          account({
            activities: [{ type: "DIVIDEND", date: "2025-02-01", amount: 3, units: 0, symbol: "OLD" }],
            positions: [{ symbol: "OLD", units: 5, price: 10, cashEquivalent: false }],
          }),
          account({ id: "a2", positions: [{ symbol: "NEW", units: 5, price: 10, cashEquivalent: false }] }),
        ],
      }),
    );
    expect(plan.facts?.firstSeen).toEqual({ OLD: "2025-02-01", NEW: TODAY });
  });

  it("stores the parts of each account's name and how many securities it holds", () => {
    const plan = planSync(
      input({
        fetched: [
          account({
            institution: "Fidelity",
            name: "Roth IRA",
            lastFour: "4471",
            positions: [
              { symbol: "VTI", units: 3, price: 250, cashEquivalent: false },
              { symbol: "SPAXX", units: 90, price: 1, cashEquivalent: true },
            ],
          }),
          account({ id: "a2", positions: null }),
        ],
      }),
    );
    expect(plan.accounts[0]).toMatchObject({
      institution: "Fidelity",
      name: "Roth IRA",
      lastFour: "4471",
      positionsCount: 1,
    });
    expect(plan.accounts[1]).toMatchObject({ institution: null, positionsCount: null });
  });

  it("says which accounts hold each holding, and lists left-out accounts apart", () => {
    const plan = planSync(
      input({
        fetched: [
          account({
            positions: [{ symbol: "VTI", units: 3, price: 100, cashEquivalent: false, name: "Vanguard Total Stock Market ETF" }],
          }),
          account({
            id: "a2",
            positions: [
              { symbol: "VTI", units: 1, price: 100, cashEquivalent: false },
              { symbol: "AAPL", units: 2, price: 200, cashEquivalent: false },
            ],
          }),
          account({
            id: "play",
            positions: [{ symbol: "GME", units: 5, price: 20, cashEquivalent: false }],
          }),
        ],
        storedAccounts: [{ id: "play", counted: false, lastSyncedOn: "2026-11-10" }],
      }),
    );
    expect(plan.facts?.facts.holdings).toEqual([
      { ticker: "VTI", share: 0.5, change: 0, name: "Vanguard Total Stock Market ETF", accounts: ["a1", "a2"] },
      { ticker: "AAPL", share: 0.5, change: 0, accounts: ["a2"] },
    ]);
    expect(plan.facts?.facts.otherHoldings).toEqual([
      { ticker: "GME", share: 1, change: 0, accounts: ["play"] },
    ]);
  });
});
