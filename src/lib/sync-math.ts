/**
 * Turns what a brokerage reports into what Holdfast stores: a daily return
 * per account, and habit facts. Pure functions, no I/O.
 */

import type { HabitFacts, Holding } from "./badges";
import { addDays, daysInclusive } from "./quarters";
import { dailyReturn, flowRate, type DailyReturnRow } from "./scoring";

export type Activity = {
  type: string;
  date: string;
  amount: number;
  units: number;
  /** Price per unit, where the brokerage gives one. */
  price?: number | null;
  symbol: string | null;
};

export type Position = {
  symbol: string;
  units: number;
  price: number;
  cashEquivalent: boolean;
  /** What the security is called, where the brokerage says. */
  name?: string | null;
  /** The account that holds it. */
  accountId?: string;
  /** The ticker with its exchange suffix, for price lookups. */
  quoteSymbol?: string;
  /** The currency the security trades in, where given. */
  currency?: string;
};

export type Snapshot = { date: string; balance: number };

/** How many days of balances are kept. Older ones are deleted. */
export const BALANCE_WINDOW_DAYS = 10;
/** How far back transactions are read for habits and the One Year Hold badge. */
export const ACTIVITY_LOOKBACK_DAYS = 800;

/** The most holdings kept per person, largest first. */
export const MAX_HOLDINGS = 100;

const DIVIDEND_TYPES = new Set(["DIVIDEND", "STOCK_DIVIDEND", "SUBSTITUTE_DIVIDEND"]);

const MONEY_IN = new Set(["CONTRIBUTION", "DEPOSIT"]);
const MONEY_OUT = new Set(["WITHDRAWAL"]);
const ASSETS_IN = new Set(["EXTERNAL_ASSET_TRANSFER_IN"]);
const ASSETS_OUT = new Set(["EXTERNAL_ASSET_TRANSFER_OUT"]);

/**
 * Money and holdings moved in or out by the account holder, per day.
 * Deposits are positive. Dividends, interest and fees are part of the
 * return, not a flow.
 *
 * `unclear` lists days with a transfer whose value could not be worked out.
 * Those days are marked partial, because an unvalued transfer in would
 * otherwise look like a gain.
 */
export function flowsByDay(activities: readonly Activity[]): {
  flows: Map<string, number>;
  unclear: Set<string>;
} {
  const flows = new Map<string, number>();
  const unclear = new Set<string>();
  for (const a of activities) {
    const amount = Number.isFinite(a.amount) ? a.amount : 0;
    const units = Number.isFinite(a.units) ? a.units : 0;
    const price = a.price && Number.isFinite(a.price) && a.price > 0 ? a.price : null;
    // What the moved holdings were worth, when cash did not say.
    const worth = amount !== 0 ? Math.abs(amount) : price !== null ? Math.abs(units) * price : null;
    let flow: number | null = 0;
    if (MONEY_IN.has(a.type)) flow = Math.abs(amount);
    else if (MONEY_OUT.has(a.type)) flow = -Math.abs(amount);
    else if (ASSETS_IN.has(a.type)) flow = worth;
    else if (ASSETS_OUT.has(a.type)) flow = worth === null ? null : -worth;
    else if (a.type === "TRANSFER") {
      // A transfer's sign says which way it went: cash first, then units.
      if (amount !== 0) flow = amount;
      else if (units !== 0) flow = price === null ? null : units * price;
    }
    if (flow === null) unclear.add(a.date);
    else if (flow !== 0) flows.set(a.date, (flows.get(a.date) ?? 0) + flow);
  }
  return { flows, unclear };
}

/** The flows alone. See `flowsByDay`. */
export function netDepositsByDay(activities: readonly Activity[]): Map<string, number> {
  return flowsByDay(activities).flows;
}

/**
 * Rebuilds daily returns for the days covered by the stored balances.
 *
 * Each pair of neighbouring snapshots gives one return, dated on the later
 * day and measured after removing every deposit and withdrawal in between.
 * If a sync was missed, the days in between are flat and the catch-up day
 * carries the whole move, so the chained total stays exact.
 *
 * A day is partial when the brokerage's transactions are not yet known
 * through it, because an unreported deposit would look like a gain. It is
 * recomputed on later syncs while it is still inside the balance window.
 */
export function recomputeWindow(
  snapshots: readonly Snapshot[],
  flows: ReadonlyMap<string, number>,
  transactionsThrough: string | null,
  unclear: ReadonlySet<string> = new Set(),
): DailyReturnRow[] {
  const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows: DailyReturnRow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.date === prev.date) continue;
    let net = 0;
    let unvalued = false;
    for (let d = addDays(prev.date, 1); d <= cur.date; d = addDays(d, 1)) {
      net += flows.get(d) ?? 0;
      unvalued ||= unclear.has(d);
    }
    const gap = daysInclusive(prev.date, cur.date) - 2;
    const unsure =
      unvalued || transactionsThrough === null || transactionsThrough < cur.date;
    for (let d = addDays(prev.date, 1); d < cur.date; d = addDays(d, 1)) {
      // A long silence is worth flagging. A weekend-length one is not.
      rows.push({ date: d, dailyReturn: 0, flowRate: 0, partial: gap > 4 || unsure });
    }
    const input = { previousBalance: prev.balance, balance: cur.balance, netDeposits: net };
    const value = dailyReturn(input);
    const emptyBothDays = Math.abs(prev.balance) < 1 && Math.abs(cur.balance) < 1 && net === 0;
    rows.push({
      date: cur.date,
      dailyReturn: value ?? 0,
      flowRate: flowRate(input),
      partial: unsure || (value === null && !emptyBothDays),
    });
  }
  return rows;
}

/**
 * Each account's share of the total starting balance for a day, 0 to 1.
 * Null when no account had anything to start the day with.
 */
export function weightsFor(
  startingBalances: ReadonlyMap<string, number>,
): Map<string, number | null> {
  let total = 0;
  for (const b of startingBalances.values()) total += Math.max(0, b);
  return new Map(
    [...startingBalances].map(([id, b]) => [id, total > 0 ? Math.max(0, b) / total : null]),
  );
}

/**
 * The day the current unbroken holding of each symbol began.
 *
 * When the opening trade is in the history, that is the day. When it is not,
 * the holding is only as old as the evidence for it, which is the date in
 * `firstSeen` (see `firstSeenDays`). Holdfast does not assume a holding is
 * older than that.
 */
export function heldSince(
  activities: readonly Activity[],
  positions: readonly Position[],
  firstSeen: Readonly<Record<string, string>>,
  today: string,
): Map<string, string> {
  const since = new Map<string, string>();
  const held = new Map<string, number>();
  for (const p of positions) {
    if (!p.cashEquivalent && p.units > 0) held.set(p.symbol, (held.get(p.symbol) ?? 0) + p.units);
  }
  const delta = (a: Activity): number => {
    const u = Math.abs(a.units);
    if (a.type === "BUY" || a.type === "REI" || a.type === "STOCK_DIVIDEND") return u;
    if (a.type === "EXTERNAL_ASSET_TRANSFER_IN") return u;
    if (a.type === "SELL" || a.type === "EXTERNAL_ASSET_TRANSFER_OUT") return -u;
    if (a.type === "TRANSFER" || a.type === "SPLIT") return a.units;
    return 0;
  };
  for (const [symbol, unitsNow] of held) {
    const moves = activities
      .filter((a) => a.symbol === symbol && a.date <= today && delta(a) !== 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    // Walk backwards from today's units to find when the position opened.
    // Brokerages round fractional units, so "zero" allows a little slack.
    const slack = Math.max(1e-9, unitsNow * 1e-4);
    let units = unitsNow;
    let opened: string | null = null;
    for (const move of moves) {
      units -= delta(move);
      if (units <= slack) {
        opened = move.date;
        break;
      }
    }
    since.set(symbol, opened ?? firstSeen[symbol] ?? today);
  }
  return since;
}

/**
 * A person's habit facts from their transactions and positions across the
 * accounts they count. Tickers, dates and shares only.
 */
export function buildFacts(input: {
  activities: readonly Activity[];
  positions: readonly Position[];
  /** Price of each symbol when the quarter began, for the change figure. */
  startPrices: Readonly<Record<string, number>>;
  /** The day each start price was taken. */
  startPriceDays?: Readonly<Record<string, string>>;
  /** The day Holdfast first saw each symbol held. */
  firstSeen?: Readonly<Record<string, string>>;
  today: string;
}): HabitFacts {
  const { activities, positions, startPrices, today } = input;

  const firstBuyOfMonth = new Map<string, string>();
  for (const a of activities) {
    if (a.type !== "BUY" || a.date > today) continue;
    const month = a.date.slice(0, 7);
    const known = firstBuyOfMonth.get(month);
    if (!known || a.date < known) firstBuyOfMonth.set(month, a.date);
  }
  const buyDates = [...firstBuyOfMonth.values()].sort();

  const dividendDates = activities
    .filter((a) => DIVIDEND_TYPES.has(a.type) && a.date <= today)
    .map((a) => a.date)
    .sort();

  const holdings = holdingsFrom(
    positions,
    startPrices,
    input.startPriceDays ?? {},
    today,
  );

  const openings = [
    ...heldSince(activities, positions, input.firstSeen ?? {}, today).values(),
  ].sort();
  return {
    buyMonths: buyDates.map((d) => d.slice(0, 7)),
    buyDates,
    dividendDates,
    holdings,
    holdingSince: openings[0] ?? null,
  };
}

/**
 * Positions as holdings: one per symbol however many accounts hold it, as a
 * share of the positions passed in, largest first. No dollar amounts.
 */
export function holdingsFrom(
  positions: readonly Position[],
  startPrices: Readonly<Record<string, number>>,
  startPriceDays: Readonly<Record<string, string>> = {},
  today?: string,
): Holding[] {
  type Entry = { value: number; price: number; name?: string; accounts: Set<string> };
  const bySymbol = new Map<string, Entry>();
  for (const p of positions) {
    if (p.cashEquivalent || p.units <= 0 || p.price <= 0) continue;
    const entry: Entry =
      bySymbol.get(p.symbol) ?? { value: 0, price: p.price, accounts: new Set() };
    entry.value += p.units * p.price;
    if (p.name && !entry.name) entry.name = p.name.slice(0, 80);
    if (p.accountId) entry.accounts.add(p.accountId);
    bySymbol.set(p.symbol, entry);
  }
  let total = 0;
  for (const e of bySymbol.values()) total += e.value;
  return [...bySymbol]
    .map(([ticker, e]) => {
      const start = startPrices[ticker];
      const from = startPriceDays[ticker];
      // A price first taken today has had no time to move: unknown, not 0%.
      const fresh = from !== undefined && from === today;
      const holding: Holding = {
        ticker,
        share: total > 0 ? e.value / total : 0,
        change: start && start > 0 && !fresh ? e.price / start - 1 : null,
      };
      if (from) holding.changeFrom = from;
      if (e.name) holding.name = e.name;
      if (e.accounts.size > 0) holding.accounts = [...e.accounts];
      return holding;
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, MAX_HOLDINGS);
}

/** How many securities a set of positions holds, cash aside. */
export function securitiesHeld(positions: readonly Position[]): number {
  return new Set(
    positions.filter((p) => !p.cashEquivalent && p.units > 0).map((p) => p.symbol),
  ).size;
}

/** Current prices by symbol, used as the next quarter's starting prices. */
export function currentPrices(positions: readonly Position[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const p of positions) {
    if (!p.cashEquivalent && p.price > 0) prices[p.symbol] = p.price;
  }
  return prices;
}

/**
 * The earliest day each current holding is known to have been held, carried
 * forward from the last sync.
 *
 * A symbol that is new since the last sync starts today. On a person's very
 * first sync there is no last sync, so `reach` gives each symbol the date of
 * the earliest transaction in the account that holds it: the history goes
 * back that far without showing the holding being opened. A symbol that is
 * no longer held drops out, so buying it again later starts a new clock.
 */
export function firstSeenDays(
  positions: readonly Position[],
  previous: Readonly<Record<string, string>> | null,
  today: string,
  reach: Readonly<Record<string, string>> = {},
): Record<string, string> {
  const seen: Record<string, string> = {};
  for (const p of positions) {
    if (p.cashEquivalent || p.units <= 0) continue;
    const fallback = previous === null ? (reach[p.symbol] ?? today) : today;
    seen[p.symbol] = previous?.[p.symbol] ?? fallback;
  }
  return seen;
}
