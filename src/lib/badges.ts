/**
 * Badges reward patient habits, never trading. Each rule reads a member's
 * habit facts, which hold tickers, dates and percentages but no dollar amounts.
 */

import { addDays, daysInclusive, type Quarter } from "./quarters";
import { monthName, plural } from "./format";

export type Holding = {
  ticker: string;
  /** Share of the member's counted portfolio, 0 to 1. */
  share: number;
  /** Price change so far this quarter, as a fraction. Null when unknown. */
  change: number | null;
};

export type HabitFacts = {
  /** Months that had at least one buy, as "YYYY-MM". */
  buyMonths: readonly string[];
  /** The first buy of each of those months, as "YYYY-MM-DD". */
  buyDates: readonly string[];
  /** Dates a dividend was paid, as "YYYY-MM-DD". */
  dividendDates: readonly string[];
  /** Current holdings, largest first. */
  holdings: readonly Holding[];
  /** The day the longest-held current holding was first bought. */
  holdingSince: string | null;
};

export const EMPTY_FACTS: HabitFacts = {
  buyMonths: [],
  buyDates: [],
  dividendDates: [],
  holdings: [],
  holdingSince: null,
};

export type BadgeKey =
  | "one_year_hold"
  | "never_missed"
  | "dividend_collector"
  | "well_spread";

export const WELL_SPREAD_LIMIT = 0.25;
export const DIVIDENDS_NEEDED = 3;

export const BADGES: Record<
  BadgeKey,
  { name: string; short: string; mark: string; rule: string }
> = {
  one_year_hold: {
    name: "One Year Hold",
    short: "One Year Hold",
    mark: "1Y",
    rule: "Keep a holding for a full year.",
  },
  never_missed: {
    name: "Never Missed a Month",
    short: "Never Missed",
    mark: "3/3",
    rule: "Make a buy in every month of the quarter.",
  },
  dividend_collector: {
    name: "Dividend Collector",
    short: "Dividends",
    mark: "DIV",
    rule: "Receive three dividends in a quarter.",
  },
  well_spread: {
    name: "Well Spread",
    short: "Well Spread",
    mark: "≤25",
    rule: "Finish a quarter with no holding above 25% of your portfolio.",
  },
};

export const BADGE_KEYS = Object.keys(BADGES) as BadgeKey[];

export type BadgeStatus = {
  key: BadgeKey;
  /** True once the rule is met for this quarter as of the given day. */
  earned: boolean;
  /** 0 to 1. How close the member is. 0 when it can no longer be earned this quarter. */
  closeness: number;
  /** Short text for what is left, such as "12 days" or "1 buy". */
  remaining: string;
  /** Short text for where the member stands now, such as "31% now". */
  standing: string;
  /** The day the rule was met, when earned. */
  earnedOn?: string;
};

export function quarterMonths(quarter: Quarter): string[] {
  const [year, month] = quarter.start.split("-").map(Number);
  return [0, 1, 2].map((i) => `${year}-${String(month + i).padStart(2, "0")}`);
}

/** Where a member stands on every badge for a quarter, as of a day in it. */
export function badgeStatuses(
  facts: HabitFacts,
  quarter: Quarter,
  asOf: string,
): BadgeStatus[] {
  const day = asOf < quarter.end ? asOf : quarter.end;
  const ended = asOf >= quarter.end;

  // One Year Hold
  const heldDays = facts.holdingSince
    ? daysInclusive(facts.holdingSince, day) - 1
    : 0;
  const holdLeft = Math.max(0, 365 - heldDays);
  const hold: BadgeStatus = {
    key: "one_year_hold",
    earned: facts.holdingSince !== null && holdLeft === 0,
    earnedOn:
      facts.holdingSince !== null && holdLeft === 0
        ? addDays(facts.holdingSince, 365)
        : undefined,
    closeness: facts.holdingSince ? Math.min(1, heldDays / 365) : 0,
    remaining: facts.holdingSince ? plural(holdLeft, "day") : "No holdings yet",
    standing: facts.holdingSince
      ? `${Math.floor(heldDays / 30)} months so far`
      : "No holdings yet",
  };

  // Never Missed a Month
  const months = quarterMonths(quarter);
  const currentMonth = day.slice(0, 7);
  const bought = months.filter((m) => facts.buyMonths.includes(m));
  const missed = months.filter(
    (m) => m < currentMonth && !facts.buyMonths.includes(m),
  );
  const buysLeft = months.length - bought.length;
  const never: BadgeStatus = {
    key: "never_missed",
    earned: buysLeft === 0,
    earnedOn:
      buysLeft === 0
        ? (months
            .map(
              (m) => facts.buyDates.find((d) => d.startsWith(m)) ?? `${m}-01`,
            )
            .sort()
            .at(-1) as string)
        : undefined,
    closeness: missed.length > 0 ? 0 : bought.length / months.length,
    remaining:
      missed.length > 0
        ? `Missed ${monthName(missed[0])}`
        : plural(buysLeft, "buy"),
    standing: `${bought.length} of ${months.length} months`,
  };

  // Dividend Collector
  const paid = facts.dividendDates
    .filter((d) => d >= quarter.start && d <= day)
    .sort();
  const dividends = paid.length;
  const dividendsLeft = Math.max(0, DIVIDENDS_NEEDED - dividends);
  const collector: BadgeStatus = {
    key: "dividend_collector",
    earned: dividendsLeft === 0,
    earnedOn: dividendsLeft === 0 ? paid[DIVIDENDS_NEEDED - 1] : undefined,
    closeness: Math.min(1, dividends / DIVIDENDS_NEEDED),
    remaining: plural(dividendsLeft, "dividend"),
    standing: `${dividends} of ${DIVIDENDS_NEEDED} received`,
  };

  // Well Spread: judged on the last day of the quarter.
  const top = facts.holdings.reduce((max, h) => Math.max(max, h.share), 0);
  const within = facts.holdings.length > 0 && top <= WELL_SPREAD_LIMIT;
  const over = Math.round((top - WELL_SPREAD_LIMIT) * 100);
  const spread: BadgeStatus = {
    key: "well_spread",
    earned: within && ended,
    earnedOn: within && ended ? quarter.end : undefined,
    closeness:
      facts.holdings.length === 0
        ? 0
        : within
          ? 0.95
          : Math.max(0, 1 - (top - WELL_SPREAD_LIMIT) * 4),
    remaining:
      facts.holdings.length === 0
        ? "No holdings yet"
        : within
          ? `Hold to ${monthName(quarter.end)} ${Number(quarter.end.slice(8))}`
          : `${plural(over, "pt")} over`,
    standing:
      facts.holdings.length === 0
        ? "No holdings yet"
        : `${Math.round(top * 100)}% now`,
  };

  return [hold, never, collector, spread];
}

/** The unearned badge a member is closest to, if any is still reachable. */
export function nextBadge(
  statuses: readonly BadgeStatus[],
  alreadyHeld: readonly BadgeKey[] = [],
): BadgeStatus | null {
  const open = statuses
    .filter((s) => !s.earned && !alreadyHeld.includes(s.key) && s.closeness > 0)
    .sort((a, b) => b.closeness - a.closeness);
  return open[0] ?? null;
}

/** Months with a buy over the trailing year ending in the month of `asOf`. */
export function buyingRhythm(
  facts: HabitFacts,
  asOf: string,
): { month: string; bought: boolean }[] {
  const [year, month] = asOf.split("-").map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(Date.UTC(year, month - 1 - (11 - i), 1));
    const key = `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
    return { month: key, bought: facts.buyMonths.includes(key) };
  });
}

/** Consecutive months with a buy, ending at the latest month that has one. */
export function buyStreak(facts: HabitFacts, asOf: string): number {
  const rhythm = buyingRhythm(facts, asOf).reverse();
  // The current month does not break a streak until it is over.
  const from = rhythm[0]?.bought ? 0 : 1;
  let streak = 0;
  for (let i = from; i < rhythm.length && rhythm[i].bought; i++) streak++;
  return streak;
}

/** A one-line investing style, chosen from the member's habits. */
export function styleLabel(facts: HabitFacts, asOf: string): string {
  const heldDays = facts.holdingSince
    ? daysInclusive(facts.holdingSince, asOf) - 1
    : 0;
  const yearOfDividends = facts.dividendDates.filter(
    (d) => d > addDays(asOf, -365),
  ).length;
  const top = facts.holdings.reduce((max, h) => Math.max(max, h.share), 0);
  if (buyStreak(facts, asOf) >= 6) return "Steady Builder";
  if (heldDays >= 365) return "Patient Holder";
  if (yearOfDividends >= 8) return "Dividend Gatherer";
  if (facts.holdings.length >= 4 && top <= WELL_SPREAD_LIMIT) return "Wide Net";
  return "Long-Term Investor";
}
