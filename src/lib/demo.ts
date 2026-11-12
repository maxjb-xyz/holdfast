/**
 * The demo league. SnapTrade's test OAuth app allows only five users, so
 * every visitor gets a league that is already full of rivals to play against.
 *
 * Rivals are not stored anywhere. Everything about a rival on a given day is
 * computed from their id and the date, so the league is the same for everyone,
 * never changes after the fact, and keeps moving without a job to feed it.
 */

import { badgeStatuses, type HabitFacts, type Holding } from "./badges";
import {
  DEFAULT_PRIVACY,
  type EarnedBadge,
  type League,
  type Player,
} from "./model";
import {
  addDays,
  daysInclusive,
  quarterOf,
  quartersEndingAt,
  type Quarter,
} from "./quarters";
import type { DailyReturnRow } from "./scoring";

type DemoHolding = {
  ticker: string;
  share: number;
  /** Pays a dividend in months where month % 3 equals this, on this day. */
  pays?: [monthMod: number, day: number];
};

export type DemoProfile = {
  id: string;
  name: string;
  /** Short line shown under the name. */
  note: string;
  /** Average daily return on a trading day, as a fraction. */
  drift: number;
  /** Typical size of a daily swing, as a fraction. */
  swing: number;
  /** Chance of making a buy in any given month. */
  buyRate: number;
  /** The day their longest-held holding was first bought. */
  holdingSince: string;
  holdings: readonly DemoHolding[];
  /** Joins this many days into the current quarter. Founding member if unset. */
  joinsOnDay?: number;
  /** Connection breaks this many days into the current quarter. */
  pausesOnDay?: number;
  /** Inclusive range of current-quarter days with incomplete brokerage data. */
  partialDays?: [number, number];
};

export const DEMO_LEAGUE_ID = "demo";
export const DEMO_LEAGUE_NAME = "Slow & Steady";
export const DEMO_VIEWER_ID = "demo-you";

export const DEMO_RIVALS: readonly DemoProfile[] = [
  {
    id: "demo-priya",
    name: "Priya N.",
    note: "Index funds, monthly buys",
    drift: 0.00042,
    swing: 0.0042,
    buyRate: 1,
    holdingSince: "2024-03-04",
    holdings: [
      { ticker: "VOO", share: 0.24, pays: [0, 27] },
      { ticker: "VXUS", share: 0.22, pays: [0, 20] },
      { ticker: "QQQM", share: 0.2, pays: [0, 24] },
      { ticker: "BND", share: 0.18, pays: [1, 5] },
      { ticker: "VNQ", share: 0.16, pays: [0, 26] },
    ],
  },
  {
    id: "demo-tomas",
    name: "Tomás R.",
    note: "Dividend growers",
    drift: 0.00036,
    swing: 0.0036,
    buyRate: 0.8,
    holdingSince: "2025-11-23",
    holdings: [
      { ticker: "SCHD", share: 0.34, pays: [0, 24] },
      { ticker: "JNJ", share: 0.2, pays: [0, 9] },
      { ticker: "PG", share: 0.18, pays: [2, 15] },
      { ticker: "KO", share: 0.16, pays: [1, 1] },
      { ticker: "O", share: 0.12, pays: [1, 14] },
    ],
  },
  {
    id: "demo-hana",
    name: "Hana K.",
    note: "Broad market and bonds",
    drift: 0.0003,
    swing: 0.003,
    buyRate: 0.9,
    holdingSince: "2025-02-18",
    holdings: [
      { ticker: "VT", share: 0.25, pays: [0, 22] },
      { ticker: "BND", share: 0.25, pays: [1, 5] },
      { ticker: "VTIP", share: 0.2 },
      { ticker: "VXUS", share: 0.16, pays: [0, 20] },
      { ticker: "VB", share: 0.14 },
    ],
    partialDays: [19, 25],
  },
  {
    id: "demo-ingrid",
    name: "Ingrid L.",
    note: "Three funds, rarely trades",
    drift: 0.00026,
    swing: 0.0034,
    buyRate: 0.45,
    holdingSince: "2023-06-12",
    holdings: [
      { ticker: "VTI", share: 0.52, pays: [0, 27] },
      { ticker: "VXUS", share: 0.28, pays: [0, 20] },
      { ticker: "BND", share: 0.2, pays: [1, 5] },
    ],
    pausesOnDay: 36,
  },
  {
    id: "demo-dele",
    name: "Dele A.",
    note: "New this quarter",
    drift: 0.0002,
    swing: 0.005,
    buyRate: 0.7,
    holdingSince: "2026-05-06",
    holdings: [
      { ticker: "VTI", share: 0.4, pays: [0, 27] },
      { ticker: "MSFT", share: 0.24, pays: [0, 12] },
      { ticker: "AAPL", share: 0.2, pays: [2, 14] },
      { ticker: "SCHD", share: 0.16, pays: [0, 24] },
    ],
    joinsOnDay: 34,
  },
];

/** The stand-in for "you" until a real brokerage account is connected. */
export const DEMO_VIEWER: DemoProfile = {
  id: DEMO_VIEWER_ID,
  name: "You",
  note: "Demo portfolio",
  drift: 0.00036,
  swing: 0.0038,
  buyRate: 0.85,
  holdingSince: "2025-04-10",
  holdings: [
    { ticker: "VTI", share: 0.31, pays: [0, 27] },
    { ticker: "VXUS", share: 0.22, pays: [0, 20] },
    { ticker: "BND", share: 0.18, pays: [1, 5] },
    { ticker: "SCHD", share: 0.12, pays: [0, 24] },
    { ticker: "AAPL", share: 0.09, pays: [2, 14] },
    { ticker: "VNQ", share: 0.08 },
  ],
};

/** FNV-1a string hash mixed into a mulberry32 step: a repeatable 0..1 value. */
function unit(key: string): number {
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  let t = (h + 0x6d2b79f5) | 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function isWeekend(date: string): boolean {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return day === 0 || day === 6;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** A profile's return for one day. Markets are closed at weekends, so those are flat. */
export function demoDailyReturn(profile: DemoProfile, date: string): number {
  if (isWeekend(date)) return 0;
  // Box-Muller: two repeatable uniform values to one bell-curve value.
  const u1 = Math.max(unit(`${profile.id}:${date}:a`), 1e-9);
  const u2 = unit(`${profile.id}:${date}:b`);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const clamped = Math.max(-3, Math.min(3, z));
  return profile.drift + profile.swing * clamped;
}

/** Months from `count - 1` months before `date`'s month through its month. */
function monthsEndingAt(date: string, count: number): string[] {
  const [year, month] = date.split("-").map(Number);
  return Array.from({ length: count }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (count - 1 - i), 1));
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
  });
}

/** The day in a month the profile makes its buy, if it buys that month. */
function demoBuyDate(profile: DemoProfile, month: string): string | null {
  if (unit(`${profile.id}:buy:${month}`) >= profile.buyRate) return null;
  const day = 1 + Math.floor(unit(`${profile.id}:buyday:${month}`) * 9);
  return `${month}-${pad(day)}`;
}

/** A ticker's price change over a quarter so far. The same for every holder. */
function demoPriceChange(
  ticker: string,
  quarter: Quarter,
  asOf: string,
): number {
  const day = asOf < quarter.end ? asOf : quarter.end;
  const progress =
    daysInclusive(quarter.start, day) /
    daysInclusive(quarter.start, quarter.end);
  const calm = ["BND", "VTIP"].includes(ticker) ? 0.2 : 1;
  return (unit(`${ticker}:${quarter.key}`) - 0.36) * 0.24 * calm * progress;
}

/** A profile's habit facts as they stood on a given day. */
export function demoFacts(profile: DemoProfile, asOf: string): HabitFacts {
  const quarter = quarterOf(asOf);
  const months = monthsEndingAt(asOf, 30);
  const buyDates = months
    .map((m) => demoBuyDate(profile, m))
    .filter((d): d is string => d !== null && d <= asOf);
  const dividendDates = months
    .slice(-15)
    .flatMap((m) =>
      profile.holdings
        .filter((h) => h.pays && Number(m.slice(5)) % 3 === h.pays[0])
        .map((h) => `${m}-${pad((h.pays as [number, number])[1])}`),
    )
    .filter((d) => d <= asOf)
    .sort();
  const holdings: Holding[] = profile.holdings.map((h) => ({
    ticker: h.ticker,
    share: h.share,
    change: demoPriceChange(h.ticker, quarter, asOf),
  }));
  return {
    buyMonths: [...new Set(buyDates.map((d) => d.slice(0, 7)))],
    buyDates,
    dividendDates,
    holdings,
    holdingSince: profile.holdingSince <= asOf ? profile.holdingSince : null,
  };
}

const quarterDay = (quarter: Quarter, day: number) =>
  addDays(quarter.start, day - 1);

/** How many quarters of history the demo keeps, the current one included. */
const HISTORY_QUARTERS = 4;

/** Builds a demo profile into a player, with history up to `today`. */
export function demoPlayer(profile: DemoProfile, today: string): Player {
  const current = quarterOf(today);
  const history = quartersEndingAt(current, HISTORY_QUARTERS);
  const joinedOn = profile.joinsOnDay
    ? quarterDay(current, profile.joinsOnDay)
    : addDays(history[0].start, -1);
  const pauseDay = profile.pausesOnDay
    ? quarterDay(current, profile.pausesOnDay)
    : undefined;
  const pausedSince = pauseDay && pauseDay < today ? pauseDay : undefined;
  const lastDay = pausedSince ?? today;
  const firstDay = profile.joinsOnDay ? joinedOn : history[0].start;
  const [partialFrom, partialTo] = profile.partialDays
    ? profile.partialDays.map((d) => quarterDay(current, d))
    : ["", ""];

  const facts = demoFacts(profile, today);
  const buyDates = new Set(facts.buyDates);
  const rows: DailyReturnRow[] = [];
  for (let date = firstDay; date <= lastDay; date = addDays(date, 1)) {
    rows.push({
      date,
      dailyReturn: demoDailyReturn(profile, date),
      partial: date >= partialFrom && date <= partialTo,
      flowRate: buyDates.has(date)
        ? 0.008 + unit(`${profile.id}:flow:${date}`) * 0.012
        : 0,
    });
  }

  const snapshots: Record<string, HabitFacts> = {};
  const earned: EarnedBadge[] = [];
  const anniversary = addDays(profile.holdingSince, 365);
  if (anniversary <= today) {
    earned.push({
      key: "one_year_hold",
      quarter: quarterOf(anniversary).key,
      on: anniversary,
    });
  }
  for (const quarter of history) {
    if (quarter.end < firstDay) continue;
    const ended = quarter.end < today;
    const at = ended ? quarter.end : today;
    const quarterFacts = ended ? demoFacts(profile, at) : facts;
    if (ended) snapshots[quarter.key] = quarterFacts;
    for (const status of badgeStatuses(quarterFacts, quarter, at)) {
      // One Year Hold is earned once, above. The rest can be earned every quarter.
      if (status.key === "one_year_hold" || !status.earnedOn) continue;
      if (status.earnedOn < firstDay) continue;
      earned.push({
        key: status.key,
        quarter: quarter.key,
        on: status.earnedOn,
      });
    }
  }

  return {
    userId: profile.id,
    name: profile.name,
    note: profile.note,
    joinedOn,
    rows,
    pausedSince,
    since: firstDay,
    facts,
    snapshots,
    earned,
    privacy:
      profile.id === "demo-tomas" || profile.id === "demo-priya"
        ? { ...DEFAULT_PRIVACY, showHoldings: true }
        : DEFAULT_PRIVACY,
    accounts:
      profile.id === DEMO_VIEWER_ID
        ? [
            {
              id: "demo-a1",
              label: "Fidelity Individual ··4471",
              institution: "Fidelity",
              name: "Individual",
              lastFour: "4471",
              counted: true,
              connected: true,
            },
            {
              id: "demo-a2",
              label: "Fidelity Roth IRA ··8443",
              institution: "Fidelity",
              name: "Roth IRA",
              lastFour: "8443",
              counted: true,
              connected: true,
            },
            {
              id: "demo-a3",
              label: "Robinhood Individual ··2019",
              institution: "Robinhood",
              name: "Individual",
              lastFour: "2019",
              counted: false,
              connected: true,
            },
          ]
        : [],
  };
}

/**
 * The demo league as of today. Pass the real viewer once they have connected
 * an account. Until then a demo portfolio stands in for them.
 */
export function demoLeague(today: string, viewer?: Player): League {
  const current = quarterOf(today);
  const history = quartersEndingAt(current, HISTORY_QUARTERS);
  return {
    id: DEMO_LEAGUE_ID,
    name: DEMO_LEAGUE_NAME,
    isDemo: true,
    inviteCode: null,
    ownerId: null,
    createdOn: history[0].start,
    members: [
      viewer ?? demoPlayer(DEMO_VIEWER, today),
      ...DEMO_RIVALS.map((rival) => demoPlayer(rival, today)),
    ],
  };
}
