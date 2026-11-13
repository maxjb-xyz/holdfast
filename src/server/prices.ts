import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import {
  plausibleClose,
  type Baseline,
  type CloseRequest,
} from "../lib/baselines";
import { addDays, toDateString } from "../lib/quarters";

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
    const found = pick(await yahooCloses(r.quoteSymbol, start, r.on));
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

/**
 * Looks up the closes asked for. A lookup that fails or looks wrong is left
 * out, and the holding keeps the price Holdfast saw itself.
 */
export async function lookUpBaselines(
  requests: readonly CloseRequest[],
): Promise<Record<string, Baseline>> {
  if (requests.length === 0) return {};
  const key = await tiingoKey();
  const found = await Promise.all(
    requests.map(async (r) => {
      const close = await closeFor(r, key);
      return close !== null && plausibleClose(close, r.price)
        ? ([r.symbol, { from: r.from, price: close }] as const)
        : null;
    }),
  );
  return Object.fromEntries(found.filter((f) => f !== null));
}
