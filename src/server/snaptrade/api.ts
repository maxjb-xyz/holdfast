/**
 * The read-only SnapTrade calls Holdfast makes, with only the fields it uses.
 * Paths and shapes follow https://docs.snaptrade.com/openapi.yaml
 */

import { Unauthorized } from "./access";
import type { Fetch } from "./oauth";

const BASE = "https://api.snaptrade.com";

export type SnapAccount = {
  id: string;
  connectionId: string | null;
  name: string;
  institution: string;
  /** Total account value. Null when the brokerage did not report one. */
  balance: number | null;
  isPaper: boolean;
  category: string | null;
  status: string | null;
  /** All transactions up to this date are known. Null when unknown. */
  transactionsThrough: string | null;
  transactionsReady: boolean;
  holdingsAvailable: boolean;
};

export type SnapConnection = { id: string; disabled: boolean };

export type SnapActivity = {
  type: string;
  /** YYYY-MM-DD */
  date: string;
  amount: number;
  units: number;
  price: number | null;
  symbol: string | null;
};

export type SnapPosition = {
  symbol: string;
  units: number;
  price: number;
  cashEquivalent: boolean;
};

/** One day of an account's estimated total value. */
export type SnapHistoryPoint = { date: string; value: number };

type Json = Record<string, unknown>;
const obj = (v: unknown): Json => (v && typeof v === "object" ? (v as Json) : {});
const str = (v: unknown): string | null => (typeof v === "string" && v ? v : null);
const num = (v: unknown): number | null => {
  const n = typeof v === "string" ? Number(v) : v;
  return typeof n === "number" && Number.isFinite(n) ? n : null;
};
const day = (v: unknown): string | null => {
  const s = str(v);
  return s && /^\d{4}-\d{2}-\d{2}/.test(s) ? s.slice(0, 10) : null;
};
/** Some endpoints answer with a list, others wrap it in `results` or `data`. */
const list = (v: unknown): unknown[] =>
  Array.isArray(v) ? v : Array.isArray(obj(v).results) ? (obj(v).results as unknown[]) : Array.isArray(obj(v).data) ? (obj(v).data as unknown[]) : [];

export class SnapTradeApi {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async request(path: string, query: Record<string, string> = {}): Promise<Response> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await this.fetchImpl(url.toString(), {
      headers: { Authorization: `Bearer ${this.accessToken}`, Accept: "application/json" },
    });
    if (response.status === 401) throw new Unauthorized();
    return response;
  }

  private async get(path: string, query: Record<string, string> = {}): Promise<unknown> {
    const response = await this.request(path, query);
    if (!response.ok) throw new Error(`SnapTrade ${path} answered ${response.status}`);
    return response.json();
  }

  async accounts(): Promise<SnapAccount[]> {
    return list(await this.get("/accounts/all")).flatMap((raw) => {
      const a = obj(raw);
      const id = str(a.id);
      if (!id) return [];
      const sync = obj(a.sync_status);
      const transactions = obj(sync.transactions);
      const total = obj(obj(a.balance).total);
      return [
        {
          id,
          connectionId: str(a.brokerage_authorization),
          name: str(a.name) ?? "Account",
          institution: str(a.institution_name) ?? "",
          balance: num(total.amount),
          isPaper: a.is_paper === true,
          category: str(a.account_category),
          status: str(a.status),
          transactionsThrough: day(transactions.last_successful_sync),
          transactionsReady: transactions.initial_sync_completed !== false,
          holdingsAvailable: obj(sync.holdings).holdings_unavailable !== true,
        },
      ];
    });
  }

  async connections(): Promise<SnapConnection[]> {
    return list(await this.get("/authorizations")).flatMap((raw) => {
      const c = obj(raw);
      const id = str(c.id);
      return id ? [{ id, disabled: c.disabled === true }] : [];
    });
  }

  /** Every transaction in the account from `startDate` on, newest first. */
  async activities(accountId: string, startDate: string): Promise<SnapActivity[]> {
    const all: SnapActivity[] = [];
    const limit = 1000;
    for (let offset = 0; offset < 3000; offset += limit) {
      const page = list(
        await this.get(`/accounts/${encodeURIComponent(accountId)}/activities`, {
          startDate,
          offset: String(offset),
          limit: String(limit),
        }),
      );
      for (const raw of page) {
        const t = obj(raw);
        const date = day(t.trade_date) ?? day(t.settlement_date);
        const type = str(t.type);
        if (!date || !type) continue;
        const symbol = obj(t.symbol);
        all.push({
          type: type.toUpperCase(),
          date,
          amount: num(t.amount) ?? 0,
          units: num(t.units) ?? 0,
          price: num(t.price),
          symbol: str(symbol.raw_symbol) ?? str(symbol.symbol),
        });
      }
      if (page.length < limit) break;
    }
    return all;
  }

  /**
   * The account's estimated total value for each day of the past year, from
   * SnapTrade's beta history endpoint. Null when the feature is not switched
   * on for the app or the brokerage connection does not support it.
   */
  async balanceHistory(accountId: string): Promise<SnapHistoryPoint[] | null> {
    const response = await this.request(
      `/accounts/${encodeURIComponent(accountId)}/balanceHistory`,
    );
    if (response.status === 403 || response.status === 404) return null;
    if (!response.ok) {
      throw new Error(`SnapTrade balanceHistory answered ${response.status}`);
    }
    const body = obj(await response.json());
    const history = Array.isArray(body.history) ? body.history : [];
    return history.flatMap((raw) => {
      const point = obj(raw);
      const date = day(point.date);
      const value = num(point.total_value);
      return date && value !== null ? [{ date, value }] : [];
    });
  }

  async positions(accountId: string): Promise<SnapPosition[]> {
    const raw = await this.get(`/accounts/${encodeURIComponent(accountId)}/positions/all`);
    return list(raw).flatMap((item) => {
      const p = obj(item);
      const instrument = obj(p.instrument);
      const symbol = str(instrument.raw_symbol) ?? str(instrument.symbol);
      const units = num(p.units);
      const price = num(p.price);
      if (!symbol || units === null || price === null) return [];
      return [{ symbol, units, price, cashEquivalent: p.cash_equivalent === true }];
    });
  }
}
