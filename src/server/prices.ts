import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  plausibleClose,
  yahooSymbol,
  type Baseline,
  type CloseRequest,
} from "../lib/baselines";
import { addDays, toDateString } from "../lib/quarters";

/** Symbols per Yahoo spark request, its own limit. */
const SPARK_BATCH = 20;
/** Holdings looked up one at a time per sync, where a batch cannot do. */
const MAX_SINGLE_LOOKUPS = 10;

/** Days looked back for a close, to step over weekends and holidays. */
const LOOKBACK_DAYS = 10;
const TIMEOUT_MS = 3000;

type Close = { date: string; close: number; currency?: string };

const toUnix = (date: string) =>
  Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

/** Daily closes from Yahoo Finance's public chart endpoint. No key needed. */
async function yahooCloses(
  symbol: string,
  start: string,
  end: string,
): Promise<Close[]> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}` +
    `?period1=${toUnix(start)}&period2=${toUnix(addDays(end, 1))}&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Holdfast)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`yahoo ${res.status}`);
  const body = (await res.json()) as {
    chart?: {
      result?: {
        timestamp?: number[];
        meta?: { gmtoffset?: number; currency?: string };
        indicators?: { quote?: { close?: (number | null)[] }[] };
      }[];
    };
  };
  const r = body.chart?.result?.[0];
  const stamps = r?.timestamp ?? [];
  const closes = r?.indicators?.quote?.[0]?.close ?? [];
  const offset = r?.meta?.gmtoffset ?? 0;
  const currency = r?.meta?.currency;
  const out: Close[] = [];
  stamps.forEach((s, i) => {
    const c = closes[i];
    if (typeof c !== "number") return;
    // The exchange's own calendar day, not UTC's.
    out.push({
      date: new Date((s + offset) * 1000).toISOString().slice(0, 10),
      close: c,
      ...(currency ? { currency } : {}),
    });
  });
  return out;
}

/**
 * Six months of daily closes for up to 20 symbols in one request, from
 * Yahoo's spark endpoint. It gives no currency, so it is only used where
 * the ticker alone settles the listing (see `batchable`).
 */
async function sparkCloses(
  symbols: readonly string[],
): Promise<Map<string, Close[]>> {
  const url =
    `https://query1.finance.yahoo.com/v8/finance/spark?symbols=${symbols.map(encodeURIComponent).join(",")}` +
    `&range=6mo&interval=1d`;
  const res = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; Holdfast)" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`yahoo spark ${res.status}`);
  const body = (await res.json()) as Record<
    string,
    { timestamp?: number[]; close?: (number | null)[] } | null
  >;
  const out = new Map<string, Close[]>();
  for (const [symbol, series] of Object.entries(body ?? {})) {
    const stamps = series?.timestamp ?? [];
    const closes = series?.close ?? [];
    const rows: Close[] = [];
    stamps.forEach((t, i) => {
      const c = closes[i];
      // Bars are stamped at the open, which is the same calendar day in
      // UTC for the Americas and Europe; an Asian open can be the day
      // before, so those listings are not batched.
      if (typeof c === "number") {
        rows.push({
          date: new Date(t * 1000).toISOString().slice(0, 10),
          close: c,
        });
      }
    });
    out.set(symbol, rows);
  }
  return out;
}

/**
 * Whether a holding can go in a batch: a US dollar listing, or a Canadian,
 * US or European one named with its exchange suffix. Anything else needs
 * the single lookup, which checks the currency.
 */
function batchable(r: CloseRequest): boolean {
  if (r.currency === "USD" || r.currency === "CAD" || r.currency === "EUR") {
    return r.currency === "USD" || r.quoteSymbol.includes(".");
  }
  return r.currency === undefined && !r.quoteSymbol.includes(".");
}

/**
 * Daily closes from Tiingo, used when a key is set and Yahoo fails. Asked
 * through today so its raw closes can be adjusted for any later split, the
 * way Yahoo's already are.
 */
async function tiingoCloses(
  key: string,
  symbol: string,
  start: string,
): Promise<Close[]> {
  const url =
    `https://api.tiingo.com/tiingo/daily/${encodeURIComponent(symbol.toLowerCase())}/prices` +
    `?startDate=${start}&endDate=${toDateString(new Date())}`;
  const res = await fetch(url, {
    headers: { Authorization: `Token ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) throw new Error(`tiingo ${res.status}`);
  const body = (await res.json()) as unknown;
  const rows = (Array.isArray(body) ? body : []) as {
    date?: string;
    close?: number;
    splitFactor?: number;
  }[];
  const out: Close[] = [];
  let later = 1;
  for (const r of [...rows].sort((a, b) =>
    String(b.date).localeCompare(String(a.date)),
  )) {
    if (typeof r.close === "number" && typeof r.date === "string") {
      out.push({
        date: r.date.slice(0, 10),
        close: r.close / later,
        currency: "USD",
      });
    }
    // A split on this day changes every close before it.
    if (typeof r.splitFactor === "number" && r.splitFactor > 0) {
      later *= r.splitFactor;
    }
  }
  return out;
}

async function tiingoKey(): Promise<string | undefined> {
  try {
    const { env } = await getCloudflareContext({ async: true });
    return (env as unknown as { TIINGO_API_KEY?: string }).TIINGO_API_KEY;
  } catch {
    return undefined;
  }
}

/**
 * The last close on or before the day asked for, in the security's own
 * currency, from Yahoo or else Tiingo. Null when neither has it.
 */
async function closeFor(
  r: CloseRequest,
  key: string | undefined,
): Promise<number | null> {
  const start = addDays(r.on, -LOOKBACK_DAYS);
  const pick = (rows: Close[]) => {
    const last = rows
      .filter((row) => row.date <= r.on)
      .sort((a, b) => a.date.localeCompare(b.date))
      .at(-1);
    if (!last) return null;
    // London prices come in pence.
    if (last.currency === "GBp" && r.currency === "GBP")
      return last.close / 100;
    // Same ticker, other listing: a price in the wrong currency is no use.
    if (r.currency && last.currency && last.currency !== r.currency) {
      return null;
    }
    return last.close;
  };
  try {
    const found = pick(await yahooCloses(yahooSymbol(r), start, r.on));
    if (found !== null) return found;
  } catch (error) {
    console.warn(`price lookup for ${r.symbol} failed`, error);
  }
  // Tiingo's daily prices cover US listings, in dollars, so only a holding
  // known to trade in dollars is looked up there.
  if (!key || r.currency !== "USD") return null;
  try {
    return pick(await tiingoCloses(key, r.symbol, start));
  } catch (error) {
    console.warn(`tiingo lookup for ${r.symbol} failed`, error);
    return null;
  }
}

/** The last close on or before `on`. */
function lastOnOrBefore(rows: readonly Close[], on: string): number | null {
  let best: Close | null = null;
  for (const row of rows) {
    if (row.date <= on && (!best || row.date > best.date)) best = row;
  }
  return best?.close ?? null;
}

/**
 * Looks up the closes asked for: most in batches of 20, the rest one at a
 * time. A lookup that fails or looks wrong is left out, and the holding
 * keeps the price Holdfast saw itself.
 */
export async function lookUpBaselines(
  requests: readonly CloseRequest[],
): Promise<Record<string, Baseline>> {
  if (requests.length === 0) return {};
  const found: Record<string, Baseline> = {};
  const keep = (r: CloseRequest, close: number | null) => {
    if (close !== null && plausibleClose(close, r.price)) {
      found[r.symbol] = { from: r.from, price: close };
    }
  };

  const batch = requests.filter(batchable);
  const groups: CloseRequest[][] = [];
  for (let i = 0; i < batch.length; i += SPARK_BATCH) {
    groups.push(batch.slice(i, i + SPARK_BATCH));
  }
  await Promise.all(
    groups.map(async (group) => {
      try {
        const series = await sparkCloses(group.map(yahooSymbol));
        for (const r of group) {
          const rows = series.get(yahooSymbol(r));
          if (rows) keep(r, lastOnOrBefore(rows, r.on));
        }
      } catch (error) {
        console.warn("batched price lookup failed", error);
      }
    }),
  );

  // Whatever a batch could not answer, and listings it cannot check, one
  // at a time with the currency checked, the largest first.
  const single = requests
    .filter((r) => !(r.symbol in found))
    .slice(0, MAX_SINGLE_LOOKUPS);
  if (single.length > 0) {
    const key = await tiingoKey();
    await Promise.all(single.map(async (r) => keep(r, await closeFor(r, key))));
  }
  return found;
}
