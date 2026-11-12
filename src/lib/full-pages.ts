/**
 * Models for the full pages behind the league and profile screens: the list
 * of leagues and the badges page. Pure functions, like `pages.ts`.
 */

import {
  BADGES,
  BADGE_KEYS,
  badgeStatuses,
  type BadgeKey,
} from "./badges";
import type { Point } from "./chart";
import { ordinal, quarterLabel, shortDate } from "./format";
import type { League, Player } from "./model";
import { leaguePage } from "./pages";
import { quarterOf, quartersEndingAt } from "./quarters";

// ---------------------------------------------------------------- leagues

export type LeagueSummaryRow = {
  id: string;
  name: string;
  isDemo: boolean;
  isOwner: boolean;
  memberCount: number;
  /** The viewer's line this quarter, for the sparkline. */
  series: Point[];
  /** The viewer's return this quarter. Null before their first scored day. */
  value: number | null;
  week: number | null;
  /** "2nd of 5", "Paused" or "Not ranked yet". */
  standing: string;
  paused: boolean;
};

/** One row of the leagues list: how the viewer is doing in that league. */
export function leagueSummary(
  league: League,
  viewerId: string,
  today: string,
): LeagueSummaryRow {
  const page = leaguePage(league, viewerId, today);
  const you = page.you;
  const ranked = page.rows.filter((r) => r.rank !== null).length;
  return {
    id: league.id,
    name: league.name,
    isDemo: league.isDemo,
    isOwner: league.ownerId === viewerId,
    memberCount: league.members.length,
    series: you?.series ?? [],
    value: you?.score.value ?? null,
    week: you && !you.paused ? you.week.value : null,
    standing: !you
      ? "Not a member"
      : you.paused
        ? "Paused"
        : you.rank === null
          ? "Not ranked yet"
          : `${ordinal(you.rank)} of ${ranked}`,
    paused: Boolean(you?.paused),
  };
}

// ----------------------------------------------------------------- badges

/** How many steps each badge's progress strip has. */
const STEPS: Record<BadgeKey, number> = {
  one_year_hold: 12,
  never_missed: 3,
  dividend_collector: 3,
  well_spread: 1,
};

export type BadgeRow = {
  key: BadgeKey;
  name: string;
  mark: string;
  rule: string;
  /** Earned at least once, in any quarter. */
  held: boolean;
  /** Earned in the current quarter. */
  earnedNow: boolean;
  /** Filled steps and total steps for this quarter's progress strip. */
  done: number;
  of: number;
  /** One line on where things stand this quarter. */
  standing: string;
  /** The last four quarters, oldest first. */
  quarters: { label: string; earned: boolean; current: boolean }[];
  times: number;
};

export type BadgesPage = {
  rows: BadgeRow[];
  /** Every badge earned in every quarter. */
  total: number;
  earnedNow: number;
  /** Not earned yet this quarter but still possible. */
  inReach: number;
  mostEarned: string | null;
};

export function badgesPage(player: Player, today: string): BadgesPage {
  const current = quarterOf(today);
  const statuses = badgeStatuses(player.facts, current, today);
  const window = quartersEndingAt(current, 4);
  const rows = BADGE_KEYS.map<BadgeRow>((key) => {
    const status = statuses.find((s) => s.key === key);
    const earned = player.earned.filter((e) => e.key === key);
    const thisQuarter = earned.find((e) => e.quarter === current.key);
    const earnedNow = Boolean(thisQuarter) || Boolean(status?.earned);
    const earnedOn = thisQuarter?.on ?? status?.earnedOn;
    const of = STEPS[key];
    const closeness = status?.closeness ?? 0;
    // Quarters on record, plus this one when the rule is already met.
    const quartersEarned = new Set(earned.map((e) => e.quarter));
    if (earnedNow) quartersEarned.add(current.key);
    return {
      key,
      name: BADGES[key].name,
      mark: BADGES[key].mark,
      rule: BADGES[key].rule,
      held: quartersEarned.size > 0,
      earnedNow,
      // A one-step strip is filled only when the rule holds right now.
      done: earnedNow
        ? of
        : of === 1
          ? Number(closeness >= 0.95)
          : Math.min(of, Math.floor(closeness * of + 1e-9)),
      of,
      standing: earnedNow
        ? earnedOn
          ? `Earned ${shortDate(earnedOn)}`
          : "Earned"
        : status
          ? closeness === 0 && status.remaining.startsWith("Missed")
            ? `${status.remaining}, back next quarter`
            : / over$|^Hold to |yet$/.test(status.remaining)
              ? `${status.standing}, ${status.remaining.charAt(0).toLowerCase()}${status.remaining.slice(1)}`
              : `${status.standing}, ${status.remaining} to go`
          : "",
      quarters: window.map((q) => ({
        label: q.key.split("-")[1],
        earned: quartersEarned.has(q.key),
        current: q.key === current.key,
      })),
      times: quartersEarned.size,
    };
  });
  const most = [...rows].sort((a, b) => b.times - a.times)[0];
  return {
    rows,
    total: rows.reduce((sum, r) => sum + r.times, 0),
    earnedNow: rows.filter((r) => r.earnedNow).length,
    inReach: rows.filter((r) => !r.earnedNow && r.done > 0).length,
    mostEarned: most && most.times > 0 ? most.name : null,
  };
}

/** "Q4 2026", for page headers. */
export function currentQuarterLabel(today: string): string {
  return quarterLabel(quarterOf(today).key);
}
