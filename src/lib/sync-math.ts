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
  symbol: string | null;
};

export type Position = {
  symbol: string;
  units: number;
  price: number;
  cashEquivalent: boolean;
};

export type Snapshot = { date: string; balance: number };

/** How many days of balances are kept. Older ones are deleted. */
export const BALANCE_WINDOW_DAYS = 10;
/** How far back transactions are read for habits and the One Year Hold badge. */
export const ACTIVITY_LOOKBACK_DAYS = 800;

const DIVIDEND_TYPES = new Set(["DIVIDEND", "STOCK_DIVIDEND", "SUBSTITUTE_DIVIDEND"]);

/**
 * Money moved in or out by the account holder, per day. Deposits are
 * positive. Dividends, interest and fees are part of the return, not a flow.
 */
export function netDepositsByDay(activities: readonly Activity[]): Map<string, number> {
  const flows = new Map<string, number>();
  for (const a of activities) {
    if (!Number.isFinite(a.amount)) continue;
    let flow = 0;
    if (a.type === "CONTRIBUTION") flow = Math.abs(a.amount);
    else if (a.type === "WITHDRAWAL") flow = -Math.abs(a.amount);
    // A transfer's sign says which way it went.
    else if (a.type === "TRANSFER") flow = a.amount;
    if (flow !== 0) flows.set(a.date, (flows.get(a.date) ?? 0) + flow);
  }
  return flows;
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
): DailyReturnRow[] {
  const sorted = [...snapshots].sort((a, b) => (a.date < b.date ? -1 : 1));
  const rows: DailyReturnRow[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const cur = sorted[i];
    if (cur.date === prev.date) continue;
    let net = 0;
    for (let d = addDays(prev.date, 1); d <= cur.date; d = addDays(d, 1)) {
      net += flows.get(d) ?? 0;
    }
    const gap = daysInclusive(prev.date, cur.date) - 2;
    const unsure = transactionsThrough === null || transactionsThrough < cur.date;
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
 * the holding is only known to be as old as the evidence: the earliest
 * transaction the brokerage reports, or the day Holdfast first saw it,
 * whichever is earlier. Holdfast does not assume a holding is older than that.
 */
function heldSince(
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
    if (a.type === "SELL") return -u;
    if (a.type === "TRANSFER" || a.type === "SPLIT") return a.units;
    return 0;
  };
  let historyReach = today;
  for (const a of activities) {
    if (a.date < historyReach) historyReach = a.date;
  }
  for (const [symbol, unitsNow] of held) {
    const moves = activities
      .filter((a) => a.symbol === symbol && a.date <= today && delta(a) !== 0)
      .sort((a, b) => (a.date < b.date ? 1 : -1)); // newest first
    // Walk backwards from today's units to find when the position opened.
    let units = unitsNow;
    let opened: string | null = null;
    for (const move of moves) {
      units -= delta(move);
      if (units <= 1e-9) {
        opened = move.date;
        break;
      }
    }
    const seen = firstSeen[symbol] ?? today;
    since.set(symbol, opened ?? (seen < historyReach ? seen : historyReach));
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

  const bySymbol = new Map<string, { value: number; price: number }>();
  for (const p of positions) {
    if (p.cashEquivalent || p.units <= 0 || p.price <= 0) continue;
    const entry = bySymbol.get(p.symbol) ?? { value: 0, price: p.price };
    entry.value += p.units * p.price;
    bySymbol.set(p.symbol, entry);
  }
  let total = 0;
  for (const e of bySymbol.values()) total += e.value;
  const holdings: Holding[] = [...bySymbol]
    .map(([ticker, e]) => {
      const start = startPrices[ticker];
      return {
        ticker,
        share: total > 0 ? e.value / total : 0,
        change: start && start > 0 ? e.price / start - 1 : null,
      };
    })
    .sort((a, b) => b.share - a.share)
    .slice(0, 40);

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

/** Current prices by symbol, used as the next quarter's starting prices. */
export function currentPrices(positions: readonly Position[]): Record<string, number> {
  const prices: Record<string, number> = {};
  for (const p of positions) {
    if (!p.cashEquivalent && p.price > 0) prices[p.symbol] = p.price;
  }
  return prices;
}

/**
 * The day each current holding was first seen, carried forward from the last
 * sync. A symbol that is no longer held drops out, so buying it again later
 * starts a new clock.
 */
export function firstSeenDays(
  positions: readonly Position[],
  previous: Readonly<Record<string, string>>,
  today: string,
): Record<string, string> {
  const seen: Record<string, string> = {};
  for (const p of positions) {
    if (p.cashEquivalent || p.units <= 0) continue;
    seen[p.symbol] = previous[p.symbol] ?? today;
  }
  return seen;
}
