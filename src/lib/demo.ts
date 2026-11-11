/**
 * The demo league. SnapTrade's test OAuth app allows only five users, so
 * every visitor gets a league that is already full of rivals to play against.
 *
 * Rivals are not stored anywhere. Each rival's return for a day is computed
 * from their id and the date, so the league is the same for everyone, never
 * changes after the fact, and keeps moving every day without a job to feed it.
 */

import { addDays, type Quarter } from "./quarters";
import type { LeagueMember } from "./league-view";
import type { DailyReturnRow } from "./scoring";

export type DemoRival = {
  id: string;
  name: string;
  /** Short line shown under the name. */
  note: string;
  /** Average daily return on a trading day, as a fraction. */
  drift: number;
  /** Typical size of a daily swing, as a fraction. */
  swing: number;
  /** Joins this many days into each quarter. 0 means a founding member. */
  joinsOnDay?: number;
  /** Connection breaks this many days into each quarter. */
  pausesOnDay?: number;
  /** Inclusive range of quarter days where the brokerage data is incomplete. */
  partialDays?: [number, number];
};

export const DEMO_LEAGUE_NAME = "Slow & Steady";

export const DEMO_RIVALS: readonly DemoRival[] = [
  {
    id: "demo-priya",
    name: "Priya N.",
    note: "Index funds, monthly buys",
    drift: 0.0011,
    swing: 0.006,
  },
  {
    id: "demo-tomas",
    name: "Tomás R.",
    note: "Dividend growers",
    drift: 0.0009,
    swing: 0.005,
  },
  {
    id: "demo-hana",
    name: "Hana K.",
    note: "Broad market and bonds",
    drift: 0.0007,
    swing: 0.004,
    partialDays: [24, 31],
  },
  {
    id: "demo-ingrid",
    name: "Ingrid L.",
    note: "Three funds, rarely trades",
    drift: 0.0006,
    swing: 0.005,
    pausesOnDay: 29,
  },
  {
    id: "demo-dele",
    name: "Dele A.",
    note: "New this quarter",
    drift: 0.0004,
    swing: 0.008,
    joinsOnDay: 34,
  },
];

/** The stand-in for "you" until a real brokerage account is connected. */
export const DEMO_VIEWER: DemoRival = {
  id: "demo-you",
  name: "You",
  note: "Demo portfolio",
  drift: 0.0009,
  swing: 0.0055,
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

/** A rival's return for one day. Markets are closed at weekends, so those are flat. */
export function demoDailyReturn(rival: DemoRival, date: string): number {
  if (isWeekend(date)) return 0;
  // Box-Muller: two repeatable uniform values to one bell-curve value.
  const u1 = Math.max(unit(`${rival.id}:${date}:a`), 1e-9);
  const u2 = unit(`${rival.id}:${date}:b`);
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  const clamped = Math.max(-3, Math.min(3, z));
  return rival.drift + rival.swing * clamped;
}

const quarterDay = (quarter: Quarter, day: number) =>
  addDays(quarter.start, day - 1);

/** Builds a rival as a league member for a quarter, with rows up to `asOf`. */
export function demoMember(
  rival: DemoRival,
  quarter: Quarter,
  asOf: string,
): LeagueMember {
  const joinedOn = rival.joinsOnDay
    ? quarterDay(quarter, rival.joinsOnDay)
    : addDays(quarter.start, -1);
  const pausedSince = rival.pausesOnDay
    ? quarterDay(quarter, rival.pausesOnDay)
    : undefined;
  const lastDay = [asOf, quarter.end, pausedSince]
    .filter((d): d is string => d !== undefined)
    .sort()[0];
  const [partialFrom, partialTo] = rival.partialDays
    ? rival.partialDays.map((d) => quarterDay(quarter, d))
    : ["", ""];

  const rows: DailyReturnRow[] = [];
  for (let date = quarter.start; date <= lastDay; date = addDays(date, 1)) {
    rows.push({
      date,
      dailyReturn: demoDailyReturn(rival, date),
      partial: date >= partialFrom && date <= partialTo,
    });
  }
  return {
    userId: rival.id,
    name: rival.name,
    joinedOn,
    rows,
    pausedSince: pausedSince && pausedSince < asOf ? pausedSince : undefined,
  };
}

/**
 * The demo league's members for a quarter. Pass the real viewer once they
 * have connected an account. Until then a demo portfolio stands in for them.
 */
export function demoLeagueMembers(
  quarter: Quarter,
  asOf: string,
  viewer?: LeagueMember,
): LeagueMember[] {
  return [
    viewer ?? demoMember(DEMO_VIEWER, quarter, asOf),
    ...DEMO_RIVALS.map((rival) => demoMember(rival, quarter, asOf)),
  ];
}
