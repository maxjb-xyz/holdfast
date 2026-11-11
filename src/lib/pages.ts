/**
 * Builds what each screen shows from a league and a viewer. Pure functions:
 * the same code serves the demo league and real leagues.
 */

import {
  BADGES,
  BADGE_KEYS,
  WELL_SPREAD_LIMIT,
  badgeStatuses,
  buyStreak,
  buyingRhythm,
  nextBadge,
  styleLabel,
  type BadgeKey,
  type HabitFacts,
  type Holding,
} from "./badges";
import { partialStretch, rebaseWindow, type Point } from "./chart";
import {
  ordinal,
  plural,
  quarterLabel,
  shortDate,
  signedPercent,
} from "./format";
import { buildLeagueView, standingsAsOf, type LeagueRow } from "./league-view";
import type { League, LinkedAccount, Player, Privacy } from "./model";
import {
  addDays,
  daysInclusive,
  previousQuarter,
  quarterOf,
  quartersEndingAt,
  type Quarter,
} from "./quarters";
import {
  chainReturns,
  firstScoredDate,
  rankMoves,
  uniqueByDate,
} from "./scoring";

export type Range = "quarter" | "month" | "week";
export const RANGE_DAYS: Record<Range, number | null> = {
  quarter: null,
  month: 30,
  week: 7,
};

const firstName = (name: string) => name.split(" ")[0];

/** How a member is named to the viewer. */
function shownName(member: { userId: string; name: string }, viewerId: string) {
  return member.userId === viewerId ? "You" : member.name;
}

// ---------------------------------------------------------------- league

export type LeaguePageRow = LeagueRow & {
  isYou: boolean;
  shownName: string;
  /** One short line under the name, or null. */
  note: string | null;
  /** The line to draw for the chosen range. */
  chart: Point[];
  /** The return over the chosen range. Equal to the score in the quarter view. */
  rangeValue: number | null;
};

export type FeedItem = {
  kind: "badge" | "passed" | "paused" | "joined" | "wrapped";
  text: string;
  date: string;
};

export type LeaguePage = {
  league: {
    id: string;
    name: string;
    isDemo: boolean;
    inviteCode: string | null;
    memberCount: number;
    isOwner: boolean;
  };
  quarter: Quarter;
  asOf: string;
  range: Range;
  dayOfQuarter: number;
  daysInQuarter: number;
  week: number;
  daysLeft: number;
  rows: LeaguePageRow[];
  you: LeaguePageRow | null;
  /** "3rd of 6", "Paused" or "Not ranked yet". */
  standing: string;
  stats: { label: string; value: string; quiet?: boolean }[];
  feed: FeedItem[];
  closest: { name: string; badge: string; remaining: string }[];
  lastQuarter: {
    quarter: Quarter;
    top: { place: string; name: string; value: string; isYou: boolean }[];
    youPlayed: boolean;
  } | null;
};

function rowNote(row: LeagueRow, quarter: Quarter): string | null {
  if (row.paused) {
    const last = row.series.at(-1)?.date;
    return last ? `Paused since ${shortDate(addDays(last, 1))}` : "Paused";
  }
  if (row.joinedThisQuarter && row.joinedOn > quarter.start) {
    return `Joined ${shortDate(row.joinedOn)}`;
  }
  const stretch = partialStretch(row.series);
  if (stretch) {
    return stretch.from === stretch.to
      ? `Partial, ${shortDate(stretch.from)}`
      : `Partial, ${shortDate(stretch.from)} to ${
          stretch.from.slice(0, 7) === stretch.to.slice(0, 7)
            ? Number(stretch.to.slice(8))
            : shortDate(stretch.to)
        }`;
  }
  return row.score.partial ? "Partial data" : null;
}

function bestHolding(facts: HabitFacts): Holding | null {
  const known = facts.holdings.filter((h) => h.change !== null);
  if (known.length === 0) return null;
  return known.reduce((best, h) =>
    (h.change as number) > (best.change as number) ? h : best,
  );
}

function worstHolding(facts: HabitFacts): Holding | null {
  const known = facts.holdings.filter((h) => h.change !== null);
  if (known.length < 2) return null;
  return known.reduce((worst, h) =>
    (h.change as number) < (worst.change as number) ? h : worst,
  );
}

/** Badge keys a player already holds for this quarter, or for good. */
function heldBadges(player: Player, quarter: Quarter): BadgeKey[] {
  return player.earned
    .filter((e) => e.key === "one_year_hold" || e.quarter === quarter.key)
    .map((e) => e.key);
}

export function leagueFeed(
  league: League,
  viewerId: string,
  today: string,
): FeedItem[] {
  const quarter = quarterOf(today);
  const items: FeedItem[] = [];
  const name = (p: { userId: string; name: string }) =>
    p.userId === viewerId ? "You" : firstName(p.name);

  for (const member of league.members) {
    const isYou = member.userId === viewerId;
    if (isYou || member.privacy.showBadges) {
      for (const badge of member.earned) {
        if (badge.on < addDays(today, -45) || badge.on > today) continue;
        if (badge.on < member.joinedOn) continue;
        items.push({
          kind: "badge",
          text: `${name(member)} earned ${BADGES[badge.key].name}`,
          date: badge.on,
        });
      }
    }
    if (member.joinedOn > quarter.start && member.joinedOn <= today) {
      items.push({
        kind: "joined",
        text: `${name(member)} joined, scored from ${shortDate(member.joinedOn)}`,
        date: member.joinedOn,
      });
    }
    if (member.pausedSince && member.pausedSince < today) {
      items.push({
        kind: "paused",
        text: isYou
          ? "Your link dropped, rank paused"
          : `${name(member)}'s link dropped, rank paused`,
        date: addDays(member.pausedSince, 1),
      });
    }
  }

  // Overtakes, day by day. Only those that involve the viewer or first place.
  const lookback = Math.min(21, daysInclusive(quarter.start, today) - 1);
  let later = standingsAsOf(league.members, quarter, today);
  for (let i = 0; i < lookback; i++) {
    const day = addDays(today, -i);
    const earlier = standingsAsOf(league.members, quarter, addDays(day, -1));
    const moves = rankMoves(later, earlier);
    const before = new Map(earlier.map((s) => [s.userId, s.rank]));
    for (const riser of later) {
      if ((moves.get(riser.userId) ?? 0) <= 0 || riser.rank === null) continue;
      const passed = later.find(
        (s) =>
          s.rank !== null &&
          s.rank > (riser.rank as number) &&
          (moves.get(s.userId) ?? 0) < 0 &&
          (before.get(s.userId) ?? 99) < (before.get(riser.userId) ?? 0),
      );
      if (!passed) continue;
      const involvesYou =
        riser.userId === viewerId || passed.userId === viewerId;
      if (!involvesYou && riser.rank !== 1) continue;
      items.push({
        kind: "passed",
        text: `${name(riser)} passed ${name(passed).replace("You", "you")} for ${ordinal(riser.rank)}`,
        date: day,
      });
    }
    later = earlier;
  }

  const last = previousQuarter(quarter);
  const you = league.members.find((m) => m.userId === viewerId);
  if (
    you &&
    firstScoredDate(last, you.joinedOn) <= last.end &&
    you.since <= last.end
  ) {
    items.push({
      kind: "wrapped",
      text: `Your ${quarterLabel(last.key)} Wrapped is ready`,
      date: quarter.start,
    });
  }

  const order = { passed: 0, badge: 1, paused: 2, joined: 3, wrapped: 4 };
  return items
    .sort(
      (a, b) =>
        (a.date < b.date ? 1 : a.date > b.date ? -1 : 0) ||
        order[a.kind] - order[b.kind],
    )
    .slice(0, 5);
}

export function leaguePage(
  league: League,
  viewerId: string,
  today: string,
  range: Range = "quarter",
): LeaguePage {
  const quarter = quarterOf(today);
  const view = buildLeagueView({
    members: league.members,
    quarter,
    asOf: today,
  });
  const players = new Map(league.members.map((m) => [m.userId, m]));
  const windowDays = RANGE_DAYS[range];

  // A month or week view only applies once the quarter is longer than it.
  const windowed = windowDays !== null && view.dayOfQuarter > windowDays;
  const origin = windowed ? addDays(view.asOf, -(windowDays as number)) : "";
  const rows = view.rows.map<LeaguePageRow>((row) => {
    const chart = windowed ? rebaseWindow(row.series, origin) : row.series;
    return {
      ...row,
      isYou: row.userId === viewerId,
      shownName: shownName(row, viewerId),
      note: rowNote(row, quarter),
      chart,
      rangeValue: !windowed
        ? row.score.value
        : row.paused || chart.length < 2
          ? null
          : chart[chart.length - 1].value,
    };
  });
  // In a window view the list follows the window: best mover first.
  if (windowed) {
    rows.sort(
      (a, b) =>
        Number(a.rangeValue === null) - Number(b.rangeValue === null) ||
        (b.rangeValue ?? 0) - (a.rangeValue ?? 0),
    );
  }
  const you = rows.find((r) => r.isYou) ?? null;
  const youPlayer = players.get(viewerId);

  const stats: LeaguePage["stats"] = [];
  if (you && youPlayer) {
    if (you.week.value !== null && !you.paused) {
      stats.push({ label: "This week", value: signedPercent(you.week.value) });
    }
    if (you.rank !== null && you.score.value !== null) {
      const ranked = rows
        .filter((r) => r.rank !== null && !r.isYou)
        .sort((a, b) => (a.rank as number) - (b.rank as number));
      const ahead = ranked
        .filter((r) => (r.rank as number) < (you.rank as number))
        .at(-1);
      const behind = ranked.find(
        (r) => (r.rank as number) > (you.rank as number),
      );
      const gap = (other: LeaguePageRow) =>
        `${(Math.abs((other.score.value as number) - (you.score.value as number)) * 100).toFixed(2)} pts`;
      if (ahead) {
        stats.push({
          label: `Gap to ${ordinal(ahead.rank as number)}`,
          value: gap(ahead),
        });
      } else if (behind) {
        stats.push({
          label: `Lead over ${ordinal(behind.rank as number)}`,
          value: gap(behind),
        });
      }
    }
    const best = bestHolding(youPlayer.facts);
    if (best) {
      stats.push({
        label: "Best holding",
        value: `${best.ticker} ${signedPercent(best.change as number, 1)}`,
      });
    }
    const dividends = youPlayer.facts.dividendDates.filter(
      (d) => d >= quarter.start && d <= today,
    ).length;
    stats.push({ label: "Dividends", value: `${dividends} received` });
    const next = nextBadge(
      badgeStatuses(youPlayer.facts, quarter, today),
      heldBadges(youPlayer, quarter),
    );
    if (next) {
      stats.push({
        label: "Next badge",
        value: BADGES[next.key].name,
        quiet: true,
      });
    }
  }

  const closest = league.members
    .filter(
      (m) => m.joinedOn <= today && !(m.pausedSince && m.pausedSince < today),
    )
    .filter((m) => m.userId === viewerId || m.privacy.showBadges)
    .map((m) => ({
      member: m,
      next: nextBadge(
        badgeStatuses(m.facts, quarter, today),
        heldBadges(m, quarter),
      ),
    }))
    .filter((x) => x.next !== null)
    .sort((a, b) => (b.next?.closeness ?? 0) - (a.next?.closeness ?? 0))
    .slice(0, 4)
    .map(({ member, next }) => ({
      name: member.userId === viewerId ? "You" : firstName(member.name),
      badge: BADGES[(next as { key: BadgeKey }).key].name,
      remaining: (next as { remaining: string }).remaining,
    }));

  const last = previousQuarter(quarter);
  const lastView = buildLeagueView({
    members: league.members,
    quarter: last,
    asOf: last.end,
  });
  const lastRanked = lastView.rows.filter((r) => r.rank !== null);
  const lastYou = lastRanked.find((r) => r.userId === viewerId);
  const top = lastRanked.slice(0, 3);
  if (lastYou && !top.includes(lastYou)) top.push(lastYou);

  const ranked = rows.filter((r) => r.rank !== null).length;
  return {
    league: {
      id: league.id,
      name: league.name,
      isDemo: league.isDemo,
      inviteCode: league.inviteCode,
      memberCount: rows.length,
      isOwner: league.ownerId === viewerId,
    },
    quarter,
    asOf: view.asOf,
    range: windowed ? range : "quarter",
    dayOfQuarter: view.dayOfQuarter,
    daysInQuarter: view.daysInQuarter,
    week: Math.min(13, Math.ceil(view.dayOfQuarter / 7)),
    daysLeft: view.daysInQuarter - view.dayOfQuarter,
    rows,
    you,
    standing: !you
      ? ""
      : you.paused
        ? "Paused"
        : you.rank === null
          ? "Not ranked yet"
          : `${ordinal(you.rank)} of ${Math.max(ranked, 1)}`,
    stats,
    feed: leagueFeed(league, viewerId, today),
    closest,
    lastQuarter:
      lastRanked.length > 0
        ? {
            quarter: last,
            top: top.map((r) => ({
              place: ordinal(r.rank as number),
              name: shownName(r, viewerId),
              value: signedPercent(r.score.value as number),
              isYou: r.userId === viewerId,
            })),
            youPlayed: lastYou !== undefined,
          }
        : null,
  };
}

// --------------------------------------------------------------- profile

export type CareerQuarter = {
  quarter: Quarter;
  current: boolean;
  series: Point[];
  value: number | null;
  rank: number | null;
  of: number;
  partial: boolean;
  paused: boolean;
};

export type BadgeTile = {
  key: BadgeKey;
  name: string;
  short: string;
  mark: string;
  rule: string;
  earned: boolean;
  /** "Q3 2026" when earned, or where the player stands now. */
  meta: string;
};

export type ProfilePage = {
  userId: string;
  name: string;
  isSelf: boolean;
  style: string;
  sinceLabel: string;
  leagueId: string;
  leagueName: string;
  stats: { label: string; value: string }[];
  /** Null when the player keeps their return history private. */
  career: CareerQuarter[] | null;
  rhythm: { month: string; bought: boolean }[] | null;
  streak: number;
  /** Only for the player themselves. */
  holdings: (Holding & { over: boolean })[] | null;
  /** Shown to friends when the player allows it. */
  bestWorst: { best: Holding; worst: Holding | null } | null;
  /** Null when the player keeps badges private. */
  badges: BadgeTile[] | null;
  badgeCount: number;
  accounts: readonly LinkedAccount[] | null;
  privacy: Privacy | null;
  paused: boolean;
  wrappedQuarter: Quarter | null;
};

/** A player's quarters in a league, oldest first, current one last. */
export function career(
  league: League,
  player: Player,
  today: string,
  count = 4,
): CareerQuarter[] {
  const current = quarterOf(today);
  return quartersEndingAt(current, count)
    .filter(
      (q) =>
        firstScoredDate(q, player.joinedOn) <= q.end && player.since <= q.end,
    )
    .filter((q) => player.joinedOn <= (q.key === current.key ? today : q.end))
    .map((quarter) => {
      const isCurrent = quarter.key === current.key;
      const view = buildLeagueView({
        members: league.members,
        quarter,
        asOf: isCurrent ? today : quarter.end,
      });
      const row = view.rows.find((r) => r.userId === player.userId);
      return {
        quarter,
        current: isCurrent,
        series: row?.series ?? [],
        value: row?.score.value ?? null,
        rank: row?.rank ?? null,
        of: view.rows.filter((r) => r.rank !== null).length,
        partial: row?.score.partial ?? false,
        paused: row?.paused ?? false,
      };
    })
    .filter((q) => q.value !== null || q.current);
}

function badgeTiles(player: Player, today: string): BadgeTile[] {
  const quarter = quarterOf(today);
  const statuses = badgeStatuses(player.facts, quarter, today);
  return BADGE_KEYS.map((key) => {
    const latest = player.earned
      .filter((e) => e.key === key)
      .sort((a, b) => (a.on < b.on ? 1 : -1))[0];
    const status = statuses.find((s) => s.key === key);
    return {
      key,
      ...BADGES[key],
      earned: latest !== undefined,
      meta: latest ? quarterLabel(latest.quarter) : (status?.standing ?? ""),
    };
  });
}

export function profilePage(
  league: League,
  userId: string,
  viewerId: string,
  today: string,
): ProfilePage | null {
  const player = league.members.find((m) => m.userId === userId);
  if (!player) return null;
  const isSelf = userId === viewerId;
  const see = (flag: keyof Privacy) => isSelf || player.privacy[flag];
  const quarters = career(league, player, today);
  const now = quarters.find((q) => q.current) ?? null;
  const finished = quarters.filter((q) => !q.current && q.rank !== null);
  const best = [...finished].sort(
    (a, b) => (a.rank as number) - (b.rank as number),
  )[0];
  const heldDays = player.facts.holdingSince
    ? daysInclusive(player.facts.holdingSince, today) - 1
    : 0;
  const streak = buyStreak(player.facts, today);
  const paused = Boolean(player.pausedSince && player.pausedSince < today);

  const stats: ProfilePage["stats"] = [];
  if (now && now.value !== null) {
    stats.push({ label: "This quarter", value: signedPercent(now.value) });
    stats.push({
      label: "Current rank",
      value: paused
        ? "Paused"
        : now.rank === null
          ? "Not ranked yet"
          : `${ordinal(now.rank)} of ${now.of}`,
    });
  }
  if (see("showReturn") && best) {
    stats.push({
      label: "Best finish",
      value: `${ordinal(best.rank as number)}, ${quarterLabel(best.quarter.key)}`,
    });
  }
  stats.push({ label: "Quarters played", value: String(quarters.length) });
  if (isSelf || player.privacy.showBadges) {
    if (heldDays >= 30) {
      stats.push({
        label: "Longest hold",
        value: plural(Math.floor(heldDays / 30.44), "month"),
      });
    }
    stats.push({ label: "Buy streak", value: plural(streak, "month") });
  }

  const sorted = [...player.facts.holdings].sort((a, b) => b.share - a.share);
  const bestH = bestHolding(player.facts);
  const last = previousQuarter(quarterOf(today));
  const playedLast = quarters.some(
    (q) => q.quarter.key === last.key && q.value !== null,
  );

  return {
    userId,
    name: isSelf && player.name === "You" ? "You" : player.name,
    isSelf,
    style: styleLabel(player.facts, today),
    sinceLabel: quarterLabel(quarterOf(player.since).key),
    leagueId: league.id,
    leagueName: league.name,
    stats,
    career: see("showReturn") ? quarters : null,
    rhythm: see("showBadges") ? buyingRhythm(player.facts, today) : null,
    streak,
    holdings: isSelf
      ? sorted
          .slice(0, 6)
          .map((h) => ({ ...h, over: h.share > WELL_SPREAD_LIMIT }))
      : null,
    bestWorst:
      !isSelf && player.privacy.showHoldings && bestH
        ? { best: bestH, worst: worstHolding(player.facts) }
        : null,
    badges: see("showBadges") ? badgeTiles(player, today) : null,
    badgeCount: new Set(player.earned.map((e) => e.key)).size,
    accounts: isSelf ? player.accounts : null,
    privacy: isSelf ? player.privacy : null,
    paused,
    wrappedQuarter: isSelf && playedLast ? last : null,
  };
}

// --------------------------------------------------------------- wrapped

export type Wrapped = {
  quarter: Quarter;
  name: string;
  leagueName: string;
  /** Card 1: the headline. */
  value: number;
  partial: boolean;
  series: Point[];
  finish: string | null;
  bestWeek: number | null;
  newBadges: BadgeKey[];
  /** Card 2: growth against money added, all as percentages of the account. */
  growth: number;
  added: number;
  /** Card 3. */
  best: Holding | null;
  worst: Holding | null;
  /** Card 4. */
  dividends: number;
  dividendMonths: string[];
  /** Card 5. */
  style: string;
  buyMonths: number;
  heldMonths: number;
};

/** The best chained return over any 7 day stretch of a series. */
function bestWeekOf(series: readonly Point[]): number | null {
  if (series.length < 8) return null;
  let best = -Infinity;
  for (let i = 7; i < series.length; i++) {
    best = Math.max(
      best,
      (1 + series[i].value) / (1 + series[i - 7].value) - 1,
    );
  }
  return best;
}

/** A player's Wrapped for a finished quarter, or null if they did not play it. */
export function wrapped(
  league: League,
  userId: string,
  quarter: Quarter,
  today: string,
): Wrapped | null {
  if (quarter.end >= today) return null;
  const player = league.members.find((m) => m.userId === userId);
  if (!player) return null;
  const view = buildLeagueView({
    members: league.members,
    quarter,
    asOf: quarter.end,
  });
  const row = view.rows.find((r) => r.userId === userId);
  if (!row || row.score.value === null) return null;

  const from = firstScoredDate(quarter, player.joinedOn);
  const days = uniqueByDate(player.rows).filter(
    (r) => r.date >= from && r.date <= quarter.end,
  );
  const total = chainReturns(
    days.map((r) => r.dailyReturn + (r.flowRate ?? 0)),
  );
  const facts = player.snapshots[quarter.key] ?? player.facts;
  const paid = facts.dividendDates.filter(
    (d) => d >= quarter.start && d <= quarter.end,
  );
  const months = [0, 1, 2].map((i) => {
    const [y, m] = quarter.start.split("-").map(Number);
    return `${y}-${String(m + i).padStart(2, "0")}`;
  });
  const ranked = view.rows.filter((r) => r.rank !== null).length;
  const heldDays = facts.holdingSince
    ? daysInclusive(facts.holdingSince, quarter.end) - 1
    : 0;

  return {
    quarter,
    name: player.name,
    leagueName: league.name,
    value: row.score.value,
    partial: row.score.partial,
    series: row.series,
    finish: row.rank !== null ? `${ordinal(row.rank)} of ${ranked}` : null,
    bestWeek: bestWeekOf(row.series),
    newBadges: player.earned
      .filter((e) => e.quarter === quarter.key)
      .map((e) => e.key),
    growth: row.score.value,
    added: total - row.score.value,
    best: bestHolding(facts),
    worst: worstHolding(facts),
    dividends: paid.length,
    dividendMonths: [...new Set(paid.map((d) => d.slice(0, 7)))],
    style: styleLabel(facts, quarter.end),
    buyMonths: months.filter((m) => facts.buyMonths.includes(m)).length,
    heldMonths: Math.floor(heldDays / 30.44),
  };
}
