import { describe, expect, it } from "vitest";
import { Unauthorized } from "./access";
import { SnapTradeApi } from "./api";
import type { Fetch } from "./oauth";

/** Answers each path with a canned body, the way SnapTrade would. */
function api(bodies: Record<string, unknown>): SnapTradeApi {
  const fetchImpl: Fetch = async (input) => {
    const path = new URL(String(input)).pathname;
    if (!(path in bodies)) return new Response("{}", { status: 404 });
    return Response.json(bodies[path]);
  };
  return new SnapTradeApi("token", fetchImpl);
}

// Shaped like the examples in https://docs.snaptrade.com/openapi.yaml
const INVESTMENT = {
  kind: "investment",
  id: "917c8734-8470-4a3e-a18f-57c3f2ee6631",
  connection_id: "87b24961-b51e-4db8-9226-f198f6518a89",
  status: "open",
  display_name: "Robinhood Individual",
  masked_account_number: "****8443",
  institution_account_id: "54953432",
  institution_id: "b6e1a9f0-6e2a-4c37-9b0a-6f1e2d3c4b5a",
  sync_status: {
    transactions: {
      initial_sync_completed: true,
      last_successful_sync: "2026-11-11",
      first_transaction_date: "2022-01-24",
    },
    positions: "2026-11-12 06:42:46.561408+00:00",
  },
  raw_type: "Margin",
  cash_or_margin: "margin",
  is_paper: false,
  net_value: { amount: 84213.55, currency: "USD" },
};

describe("SnapTradeApi.accounts", () => {
  it("reads the name, number, connection and value of an investment account", async () => {
    const [account] = await api({
      "/accounts/all": { results: [INVESTMENT] },
    }).accounts();
    expect(account).toEqual({
      id: INVESTMENT.id,
      connectionId: INVESTMENT.connection_id,
      name: "Robinhood Individual",
      rawType: "Margin",
      lastFour: "8443",
      institution: null,
      kind: "investment",
      balance: 84213.55,
      isPaper: false,
      status: "open",
      transactionsThrough: "2026-11-11",
      transactionsReady: true,
      holdingsAvailable: true,
    });
  });

  it("lists every account and says which are not investments", async () => {
    const accounts = await api({
      "/accounts/all": {
        results: [
          INVESTMENT,
          { ...INVESTMENT, id: "second", display_name: null, net_value: null },
          { ...INVESTMENT, id: "bank", kind: "deposit" },
        ],
      },
    }).accounts();
    expect(accounts.map((a) => [a.id, a.kind, a.name, a.balance])).toEqual([
      [INVESTMENT.id, "investment", "Robinhood Individual", 84213.55],
      ["second", "investment", null, null],
      ["bank", "deposit", "Robinhood Individual", 84213.55],
    ]);
  });

  it("still reads the older field names", async () => {
    const [account] = await api({
      "/accounts/all": [
        {
          id: "old",
          brokerage_authorization: "conn",
          name: "TFSA",
          number: "Q6542138443",
          institution_name: "Questrade",
          balance: { total: { amount: 1500, currency: "CAD" } },
          sync_status: { holdings: { initial_sync_completed: true } },
        },
      ],
    }).accounts();
    expect(account).toMatchObject({
      connectionId: "conn",
      name: "TFSA",
      lastFour: "8443",
      institution: "Questrade",
      kind: "investment",
      balance: 1500,
    });
  });
});

describe("SnapTradeApi.connections", () => {
  it("reads the brokerage behind each connection", async () => {
    const connections = await api({
      "/authorizations": [
        { id: "c1", disabled: false, brokerage: { name: "ROBINHOOD", display_name: "Robinhood" } },
        { id: "c2", disabled: true, brokerage: { name: "Fidelity" } },
        { id: "c3" },
      ],
    }).connections();
    expect(connections).toEqual([
      { id: "c1", disabled: false, brokerage: "Robinhood" },
      { id: "c2", disabled: true, brokerage: "Fidelity" },
      { id: "c3", disabled: false, brokerage: null },
    ]);
  });
});

describe("SnapTradeApi.positions", () => {
  it("reads securities and leaves out contracts and bare cash", async () => {
    const positions = await api({
      "/accounts/a1/positions/all": {
        results: [
          { instrument: { kind: "stock", id: "1", symbol: "AAPL", raw_symbol: "AAPL" }, units: "10", price: "190.5", cash_equivalent: false },
          { instrument: { kind: "etf", id: "2", symbol: "VAB.TO", raw_symbol: "VAB" }, units: "3.5", price: "22", cash_equivalent: false },
          { instrument: { kind: "mutualfund", id: "3", symbol: "SPAXX", raw_symbol: "SPAXX" }, units: "400", price: "1", cash_equivalent: true },
          { instrument: { kind: "option", id: "4", symbol: "AAPL  261218C00240000", multiplier: "100" }, units: "1", price: "4.2", cash_equivalent: false },
          { instrument: { kind: "cash", code: "USD" }, units: "250", price: "1", cash_equivalent: true },
          { instrument: { kind: "stock", id: "5", symbol: "NOPE", raw_symbol: "NOPE" }, units: "2", price: null, cash_equivalent: false },
        ],
        data_freshness: { as_of: "2026-11-12T06:00:00Z" },
      },
    }).positions("a1");
    expect(positions).toEqual([
      { symbol: "AAPL", units: 10, price: 190.5, cashEquivalent: false },
      { symbol: "VAB", units: 3.5, price: 22, cashEquivalent: false },
      { symbol: "SPAXX", units: 400, price: 1, cashEquivalent: true },
    ]);
  });

  it("still reads the older nested shape", async () => {
    const positions = await api({
      "/accounts/a1/positions/all": [
        { symbol: { symbol: { symbol: "VAB.TO", raw_symbol: "VAB" } }, units: 4, price: 22 },
      ],
    }).positions("a1");
    expect(positions).toEqual([{ symbol: "VAB", units: 4, price: 22, cashEquivalent: false }]);
  });
});

describe("SnapTradeApi.activities", () => {
  it("reads transactions from the paged response", async () => {
    const activities = await api({
      "/accounts/a1/activities": {
        data: [
          { id: "t1", type: "buy", trade_date: "2026-11-03T14:30:00Z", settlement_date: "2026-11-04T00:00:00Z", amount: -381, units: 2, price: 190.5, symbol: { symbol: "AAPL", raw_symbol: "AAPL" } },
          { id: "t2", type: "CONTRIBUTION", trade_date: null, settlement_date: "2026-11-01T00:00:00Z", amount: 500, units: 0, price: 0, symbol: null },
        ],
        pagination: { offset: 0, limit: 1000, total: 2 },
      },
    }).activities("a1", "2024-09-01");
    expect(activities).toEqual([
      { type: "BUY", date: "2026-11-03", amount: -381, units: 2, price: 190.5, symbol: "AAPL" },
      { type: "CONTRIBUTION", date: "2026-11-01", amount: 500, units: 0, price: 0, symbol: null },
    ]);
  });
});

function apiAnswering(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = [];
  const api = new SnapTradeApi("token-1", async (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get("Authorization"),
    });
    return new Response(JSON.stringify(body), { status });
  });
  return { api, calls };
}

describe("SnapTradeApi.balanceHistory", () => {
  it("reads the estimated daily values", async () => {
    const { api, calls } = apiAnswering(200, {
      currency: "USD",
      history: [
        { date: "2026-01-01", total_value: "15363.23" },
        { date: "2026-01-02T00:00:00Z", total_value: 15400 },
        { date: "2026-01-03", total_value: "n/a" },
        { total_value: "1" },
      ],
    });
    expect(await api.balanceHistory("acc/1")).toEqual([
      { date: "2026-01-01", value: 15363.23 },
      { date: "2026-01-02", value: 15400 },
    ]);
    expect(calls).toEqual([
      { url: "https://api.snaptrade.com/accounts/acc%2F1/balanceHistory", auth: "Bearer token-1" },
    ]);
  });

  it("answers null when the feature is not switched on", async () => {
    const { api } = apiAnswering(403, {
      detail: "Feature is not enabled for this customer or this connection",
      default_code: 1141,
    });
    expect(await api.balanceHistory("a1")).toBeNull();
  });

  it("treats an unexpected body as an empty history", async () => {
    const { api } = apiAnswering(200, []);
    expect(await api.balanceHistory("a1")).toEqual([]);
  });

  it("passes on an expired token and other failures", async () => {
    await expect(apiAnswering(401, {}).api.balanceHistory("a1")).rejects.toBeInstanceOf(Unauthorized);
    await expect(apiAnswering(500, {}).api.balanceHistory("a1")).rejects.toThrow("500");
  });
});
