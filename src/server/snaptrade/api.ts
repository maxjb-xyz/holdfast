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
  /** The name the person or the brokerage gave the account, when there is one. */
  name: string | null;
  /** The brokerage's own word for the account type, such as "Roth IRA". */
  rawType: string | null;
  /** The last four characters of the account number, when reported. */
  lastFour: string | null;
  /** The brokerage's name, on responses that carry it. See `connections`. */
  institution: string | null;
  /** "investment", "deposit", "line_of_credit", "annuity" or "mortgage". */
  kind: string;
  /** Total account value. Null when the brokerage did not report one. */
  balance: number | null;
  isPaper: boolean;
  /** "open", "closed" or "archived". Null when the brokerage does not say. */
  status: string | null;
  /** All transactions up to this date are known. Null when unknown. */
  transactionsThrough: string | null;
  transactionsReady: boolean;
  holdingsAvailable: boolean;
};

export type SnapConnection = {
  id: string;
  disabled: boolean;
  /** The brokerage behind the connection, such as "Robinhood". */
  brokerage: string | null;
};

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

/** Position kinds that are contracts, not securities a person owns. */
const CONTRACT_KINDS = new Set(["option", "future", "future_option", "cfd"]);

type Json = Record<string, unknown>;
const obj = (v: unknown): Json =>
  v && typeof v === "object" ? (v as Json) : {};
const str = (v: unknown): string | null =>
  typeof v === "string" && v ? v : null;
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
  Array.isArray(v)
    ? v
    : Array.isArray(obj(v).results)
      ? (obj(v).results as unknown[])
      : Array.isArray(obj(v).data)
        ? (obj(v).data as unknown[])
        : [];

export class SnapTradeApi {
  constructor(
    private readonly accessToken: string,
    private readonly fetchImpl: Fetch = fetch,
  ) {}

  private async get(
    path: string,
    query: Record<string, string> = {},
  ): Promise<unknown> {
    const url = new URL(path, BASE);
    for (const [k, v] of Object.entries(query)) url.searchParams.set(k, v);
    const response = await this.fetchImpl(url.toString(), {
      headers: {
        Authorization: `Bearer ${this.accessToken}`,
        Accept: "application/json",
      },
    });
    if (response.status === 401) throw new Unauthorized();
    if (!response.ok)
      throw new Error(`SnapTrade ${path} answered ${response.status}`);
    return response.json();
  }

  /**
   * Every account across the person's connections.
   *
   * Reads the current response (`connection_id`, `display_name`,
   * `net_value`, `kind`) and falls back to the older field names
   * (`brokerage_authorization`, `name`, `balance.total`) where a response
   * still uses them.
   */
  async accounts(): Promise<SnapAccount[]> {
    return list(await this.get("/accounts/all")).flatMap((raw) => {
      const a = obj(raw);
      const id = str(a.id);
      if (!id) return [];
      const sync = obj(a.sync_status);
      const transactions = obj(sync.transactions);
      const number = str(a.masked_account_number) ?? str(a.number);
      const lastFour = number?.replace(/[^0-9a-z]/gi, "").slice(-4) || null;
      return [
        {
          id,
          connectionId: str(a.connection_id) ?? str(a.brokerage_authorization),
          name: str(a.display_name) ?? str(a.name),
          rawType: str(a.raw_type),
          lastFour,
          institution: str(a.institution_name),
          kind: str(a.kind) ?? "investment",
          balance:
            num(obj(a.net_value).amount) ??
            num(obj(obj(a.balance).total).amount),
          isPaper: a.is_paper === true,
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
      const brokerage = obj(c.brokerage);
      return id
        ? [
            {
              id,
              disabled: c.disabled === true,
              brokerage: str(brokerage.display_name) ?? str(brokerage.name),
            },
          ]
        : [];
    });
  }

  /** Every transaction in the account from `startDate` on, newest first. */
  async activities(
    accountId: string,
    startDate: string,
  ): Promise<SnapActivity[]> {
    const all: SnapActivity[] = [];
    const limit = 1000;
    for (let offset = 0; offset < 3000; offset += limit) {
      const page = list(
        await this.get(
          `/accounts/${encodeURIComponent(accountId)}/activities`,
          {
            startDate,
            offset: String(offset),
            limit: String(limit),
          },
        ),
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
   * What the account holds. Options, futures and other contracts are left
   * out: holdings are the securities a person owns, and a contract's price
   * says little about how much of the portfolio it is.
   */
  async positions(accountId: string): Promise<SnapPosition[]> {
    const raw = await this.get(
      `/accounts/${encodeURIComponent(accountId)}/positions/all`,
    );
    return list(raw).flatMap((item) => {
      const p = obj(item);
      // Older responses nest the security one level further down.
      const outer = obj(p.instrument ?? p.symbol);
      const instrument =
        typeof outer.symbol === "object" ? obj(outer.symbol) : outer;
      const kind = str(instrument.kind);
      if (kind && CONTRACT_KINDS.has(kind)) return [];
      const symbol = str(instrument.raw_symbol) ?? str(instrument.symbol);
      const units = num(p.units);
      const price = num(p.price);
      if (!symbol || units === null || price === null) return [];
      return [
        { symbol, units, price, cashEquivalent: p.cash_equivalent === true },
      ];
    });
  }
}
