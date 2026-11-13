/**
 * Which holdings' start prices could be better than the price Holdfast saw
 * at its first sync of the quarter, and how to fold better ones in.
 *
 * A holding held since before the quarter began is measured from the last
 * close before the quarter; one opened during the quarter, from the close on
 * the day it was opened. Holdfast only ever asks for prices it is missing,
 * so a quarter's baseline is fetched about once per holding.
 */
import { heldSince, type Activity, type Position } from "./sync-math";
import { addDays, quarterOf } from "./quarters";

/** Price lookups per sync, to stay inside a Worker's request budget. */
export const MAX_CLOSE_LOOKUPS = 10;

export type CloseRequest = {
  symbol: string;
  /** The last close on or before this day is wanted. */
  on: string;
  /** The day the change will be measured from. */
  from: string;
  /** Today's price, to sanity-check the answer against. */
  price: number;
  /** The ticker to look up, with any exchange suffix. */
  quoteSymbol: string;
  /** The currency the answer must be in, where known. */
  currency?: string;
};

/** A closing price found for a request. */
export type Baseline = { from: string; price: number };

export function closeRequests(input: {
  activities: readonly Activity[];
  positions: readonly Position[];
  firstSeen: Readonly<Record<string, string>>;
  /** The day each current start price was taken, from the last plan. */
  startPriceDays: Readonly<Record<string, string>>;
  /** The day whose close was already looked up for each symbol. */
  closeLookups: Readonly<Record<string, string>>;
  today: string;
}): CloseRequest[] {
  const quarter = quarterOf(input.today);
  const opened = heldSince(
    input.activities,
    input.positions,
    input.firstSeen,
    input.today,
  );
  const value = new Map<string, number>();
  const price = new Map<string, number>();
  const listing = new Map<string, Position>();
  for (const p of input.positions) {
    if (p.cashEquivalent || p.units <= 0 || p.price <= 0) continue;
    value.set(p.symbol, (value.get(p.symbol) ?? 0) + p.units * p.price);
    price.set(p.symbol, p.price);
    if (!listing.has(p.symbol)) listing.set(p.symbol, p);
  }
  const out: CloseRequest[] = [];
  for (const [symbol, since] of opened) {
    const now = price.get(symbol);
    if (now === undefined) continue;
    const whole = since < quarter.start;
    const from = whole ? quarter.start : since;
    if (from >= input.today) continue;
    const on = whole ? addDays(quarter.start, -1) : since;
    // Asked once per quarter and day, whether or not it was found.
    if (input.closeLookups[symbol] === on) continue;
    // Already measured from earlier than this would give.
    const have = input.startPriceDays[symbol];
    if (have !== undefined && have < from) continue;
    out.push({
      symbol,
      on,
      from,
      price: now,
      quoteSymbol: listing.get(symbol)?.quoteSymbol ?? symbol,
      ...(listing.get(symbol)?.currency
        ? { currency: listing.get(symbol)?.currency }
        : {}),
    });
  }
  // The largest holdings first, should the lookup cap bite.
  return out
    .sort((a, b) => (value.get(b.symbol) ?? 0) - (value.get(a.symbol) ?? 0))
    .slice(0, MAX_CLOSE_LOOKUPS);
}

/**
 * A close is only trusted when it is within reach of today's price: a far-off
 * one usually means a different listing or currency under the same ticker.
 */
export function plausibleClose(close: number, price: number): boolean {
  return close > 0 && close / price > 0.4 && close / price < 2.5;
}
