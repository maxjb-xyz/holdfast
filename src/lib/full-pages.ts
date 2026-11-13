/**
 * Models for the full pages behind the league and profile screens: the list
 * of leagues and the badges page. Pure functions, like `pages.ts`.
 */

import {
  BADGES,
  BADGE_KEYS,
  WELL_SPREAD_LIMIT,
  badgeStatuses,
  type BadgeKey,
  type HabitFacts,
  type Holding,
} from "./badges";
import type { Point } from "./chart";
import {
  monthName,
  ordinal,
  plural,
  quarterLabel,
  shortDate,
  signedPercent,
} from "./format";
import type { League, LinkedAccount, Player } from "./model";
import {
  bestLabel,
  changeStart,
  leaguePage,
  QUARTER_GRACE_DAYS,
} from "./pages";
import {
  addDays,
  daysInclusive,
  quarterOf,
  quartersEndingAt,
} from "./quarters";

// --------------------------------------------------------------- accounts

/** A linked account with whatever the brokerage said about it. */
export type AccountView = LinkedAccount & {
  institution?: string | null;
  name?: string | null;
  lastFour?: string | null;
  positions?: number | null;
};

export type AccountLine = {
  id: string;
  /** The account's own name, such as "Roth IRA". */
  title: string;
  /** The brokerage that holds it, such as "Fidelity". Null when not known. */
  brokerage: string | null;
  /** Masked number and position count, as far as they are known. */
  detail: string;
  counted: boolean;
  connected: boolean;
};

/** How one account reads in a list: its name, and a quieter line of detail. */
export function accountLine(account: AccountView): AccountLine {
  const name = account.name?.trim() || null;
  // Without a name of its own, the stored label ("Fidelity ··4471") already
  // carries the brokerage and number, so the line under it does not repeat them.
  const brokerage = name ? account.institution?.trim() || null : null;
  const parts: string[] = [];
  if (name && account.lastFour) parts.push(`··${account.lastFour}`);
  if (typeof account.positions === "number") {
    parts.push(plural(account.positions, "position"));
  }
  if (!account.connected) parts.push("Link dropped");
  return {
    id: account.id,
    title: name ? withoutBrokerage(name, brokerage) : account.label,
    brokerage,
    detail: parts.join(" · "),
    counted: account.counted,
    connected: account.connected,
  };
}

/**
 * "Robinhood Individual" reads "Individual" when "Robinhood" sits under it.
 * A name that is only the brokerage is kept as it is.
 */
function withoutBrokerage(name: string, brokerage: string | null): string {
  if (!brokerage) return name;
  const lead = brokerage.toLowerCase() + " ";
  return name.toLowerCase().startsWith(lead) && name.length > lead.length
    ? name.slice(lead.length).trim()
    : name;
}

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
        ? earnedOn && earnedOn >= current.start
          ? `Earned ${shortDate(earnedOn)}`
          : status?.standing
            ? `Earned, ${status.standing}`
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

// --------------------------------------------------------------- holdings

/** A holding with the extras the sync adds when the brokerage gives them. */
type HoldingMore = Holding & { name?: string; accounts?: string[] };
type FactsMore = HabitFacts & { otherHoldings?: readonly HoldingMore[] };

export const OTHER_SCOPE = "other";

export type HoldingRow = {
  ticker: string;
  name: string | null;
  /** Share of the portfolio in view, 0 to 1. */
  share: number;
  change: number | null;
  /**
   * "Since Dec 3" when this row's change starts later than the column's,
   * or "Priced today" when it has no change yet. Null otherwise.
   */
  changeNote: string | null;
  /** Above the Well Spread mark. */
  over: boolean;
  largest: boolean;
  /** "Mar 2023", or "Before Nov 2026" when it predates Holdfast's records. */
  since: string | null;
  /** Names of the accounts holding it. Empty when not known. */
  accounts: string;
};

export type HoldingsPage = {
  rows: HoldingRow[];
  scope: string;
  /** Empty when there is nothing to choose between. */
  filters: {
    key: string;
    label: string;
    /** The brokerage, shown under an account's name. */
    brokerage?: string | null;
    active: boolean;
  }[];
  /** How many positions and accounts the counted portfolio has. */
  positions: number;
  countedAccounts: number;
  largest: { ticker: string; share: number } | null;
  stats: { label: string; value: string }[];
  /** "This quarter", or "Since Nov 12" when prices were first taken later. */
  changeHeading: string;
  /**
   * The split bar: the largest few, then everything else as one piece. Each
   * piece holds its holdings' segments; `labelled` is false when the piece is
   * too narrow for its label, which then shows on hover.
   */
  split: {
    label: string;
    share: number;
    labelled: boolean;
    parts: { ticker: string; share: number }[];
  }[];
};

/** Below this share of the bar a piece's label is hidden until hovered. */
export const SPLIT_LABEL_MIN = 0.06;

const MONTH_YEAR = (date: string) => `${monthName(date)} ${date.slice(0, 4)}`;

export function holdingsPage(
  player: Player,
  accounts: readonly AccountView[],
  firstSeen: Readonly<Record<string, string>>,
  today: string,
  scope = "all",
): HoldingsPage {
  const facts: FactsMore = player.facts;
  const counted: readonly HoldingMore[] = facts.holdings;
  const other = facts.otherHoldings ?? [];
  const lines = new Map(accounts.map((a) => [a.id, accountLine(a)]));
  const title = new Map([...lines].map(([id, l]) => [id, l.title]));
  const withHoldings = accounts.filter(
    (a) => a.counted && counted.some((h) => h.accounts?.includes(a.id)),
  );

  const filters: HoldingsPage["filters"] = [];
  if (withHoldings.length > 1 || other.length > 0) {
    filters.push({ key: "all", label: "All counted", active: false });
    if (withHoldings.length > 1) {
      for (const a of withHoldings) {
        filters.push({
          key: a.id,
          label: title.get(a.id) ?? a.label,
          brokerage: lines.get(a.id)?.brokerage ?? null,
          active: false,
        });
      }
    }
    if (other.length > 0) {
      filters.push({ key: OTHER_SCOPE, label: "Left out", active: false });
    }
  }
  const chosen = filters.find((f) => f.key === scope)?.key ?? "all";
  for (const f of filters) f.active = f.key === chosen;

  const inView =
    chosen === OTHER_SCOPE
      ? other
      : chosen === "all"
        ? counted
        : counted.filter((h) => h.accounts?.includes(chosen));
  const sorted = [...inView].sort((a, b) => b.share - a.share);
  // Anything already there on the first day Holdfast looked was bought
  // earlier than its records go, so its date is only a bound.
  const firstLook = Object.values(firstSeen).sort()[0] ?? player.since;
  const baseline = firstLook > player.since ? firstLook : player.since;
  const viewStart = changeStart(sorted, today);
  const rows = sorted.map<HoldingRow>((h, i) => {
    const seen = firstSeen[h.ticker];
    const from = h.changeFrom;
    return {
      ticker: h.ticker,
      name: h.name ?? null,
      share: h.share,
      change: h.change,
      changeNote:
        h.change === null
          ? from === today
            ? "Priced today"
            : from
              ? "No change yet"
              : null
          : from &&
              from >
                (viewStart ??
                  addDays(quarterOf(today).start, QUARTER_GRACE_DAYS - 1))
            ? `Since ${shortDate(from)}`
            : null,
      over: h.share > WELL_SPREAD_LIMIT,
      largest: i === 0,
      since: !seen
        ? null
        : seen <= baseline
          ? `Before ${MONTH_YEAR(seen)}`
          : MONTH_YEAR(seen),
      accounts: (h.accounts ?? [])
        .map((id) => title.get(id))
        .filter(Boolean)
        .join(", "),
    };
  });

  const top = [...counted].sort((a, b) => b.share - a.share)[0] ?? null;
  const stats: HoldingsPage["stats"] = [];
  if (top) {
    const gap = Math.abs(top.share - WELL_SPREAD_LIMIT) * 100;
    stats.push(
      top.share <= WELL_SPREAD_LIMIT
        ? { label: "Under the 25% limit", value: `By ${gap.toFixed(1)} pts` }
        : { label: "Over the 25% limit", value: `By ${gap.toFixed(1)} pts` },
    );
  }
  const moved = counted.filter((h) => h.change !== null);
  const best = [...moved].sort(
    (a, b) => (b.change as number) - (a.change as number),
  )[0];
  const worst = [...moved].sort(
    (a, b) => (a.change as number) - (b.change as number),
  )[0];
  if (best) {
    stats.push({
      label: bestLabel(best, counted, today, "Best this quarter"),
      value: `${best.ticker} ${signedPercent(best.change as number, 1)}`,
    });
  }
  if (worst && worst.ticker !== best?.ticker) {
    stats.push({
      label: "Weakest",
      value: `${worst.ticker} ${signedPercent(worst.change as number, 1)}`,
    });
  }
  if (facts.holdingSince) {
    const months = Math.floor(
      (daysInclusive(facts.holdingSince, today) - 1) / 30.44,
    );
    if (months >= 1) {
      stats.push({ label: "Longest held", value: plural(months, "month") });
    }
  }
  const quarter = quarterOf(today);
  const dividends = facts.dividendDates.filter(
    (d) => d >= quarter.start && d <= today,
  ).length;
  stats.push({ label: "Dividends", value: `${dividends} this quarter` });

  const lead = sorted.slice(0, 4);
  const rest = sorted.slice(4);
  // Shares of the bar, so a filtered view's pieces still fill it.
  const inViewTotal = sorted.reduce((sum, h) => sum + h.share, 0) || 1;
  const piece = (label: string, of: readonly Holding[]) => {
    const share = of.reduce((sum, h) => sum + h.share, 0);
    return {
      label,
      share,
      labelled: share / inViewTotal >= SPLIT_LABEL_MIN,
      parts: of.map((h) => ({ ticker: h.ticker, share: h.share })),
    };
  };
  const split = lead.map((h) => piece(h.ticker, [h]));
  if (rest.length > 0) split.push(piece(`${rest.length} more`, rest));

  return {
    rows,
    scope: chosen,
    filters,
    positions: counted.length,
    countedAccounts: accounts.filter((a) => a.counted).length,
    largest: top ? { ticker: top.ticker, share: top.share } : null,
    stats,
    changeHeading: viewStart ? `Since ${shortDate(viewStart)}` : "This quarter",
    split,
  };
}
