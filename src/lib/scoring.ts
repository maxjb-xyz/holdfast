/**
 * Scoring engine. Pure functions, no I/O.
 *
 * A league score is a time-weighted return: each day's return is measured
 * with deposits and withdrawals taken out, and the days are chained together.
 * Adding money never moves the score, so a small account and a large one
 * compete on equal terms. Only percentages leave this module.
 */

import { addDays, daysInclusive, type Quarter } from "./quarters";

/** One stored day for one account. `date` is the day the return ended on. */
export type DailyReturnRow = {
  date: string;
  /** Fraction, so 0.01 is +1%. */
  dailyReturn: number;
  /** True when the brokerage data behind this day was incomplete. */
  partial: boolean;
  /**
   * The account's share of the member's total balance at the start of the
   * day, between 0 and 1. Used to blend several accounts without storing
   * any dollar amounts.
   */
  weight?: number | null;
  /**
   * Net deposits for the day as a fraction of the starting balance. Lets
   * Wrapped compare growth with money added without storing dollars.
   */
  flowRate?: number;
};

/** Below this starting value there is nothing meaningful to measure against. */
const DUST = 1;

/**
 * One day's return for one account, with cash flows removed.
 * `netDeposits` is deposits minus withdrawals during the day.
 *
 * Deposits are treated as arriving at the start of the day, so they join the
 * base the day's growth is measured against. That keeps a large deposit into
 * a small account from looking like a huge gain. Withdrawals are treated as
 * leaving at the end of the day.
 *
 * Returns null when the inputs are unusable or there is nothing to measure
 * against. A loss is capped at -100%.
 */
export function dailyReturn(input: {
  previousBalance: number;
  balance: number;
  netDeposits: number;
}): number | null {
  const { previousBalance, balance, netDeposits } = input;
  if (![previousBalance, balance, netDeposits].every(Number.isFinite)) {
    return null;
  }
  const base = previousBalance + Math.max(netDeposits, 0);
  if (previousBalance < 0 || base < DUST) return null;
  return Math.max(-1, (balance - previousBalance - netDeposits) / base);
}

/** Net deposits as a fraction of the same base `dailyReturn` uses. */
export function flowRate(input: {
  previousBalance: number;
  netDeposits: number;
}): number {
  const { previousBalance, netDeposits } = input;
  const base = previousBalance + Math.max(netDeposits, 0);
  if (![previousBalance, netDeposits].every(Number.isFinite) || base < DUST) {
    return 0;
  }
  return netDeposits / base;
}

/** Keeps the first row for each date, in date order. */
export function uniqueByDate<T extends { date: string }>(
  rows: readonly T[],
): T[] {
  const seen = new Set<string>();
  return rows
    .filter((r) => (seen.has(r.date) ? false : (seen.add(r.date), true)))
    .sort((x, y) => (x.date < y.date ? -1 : x.date > y.date ? 1 : 0));
}

/** Chains daily returns into one return: (1 + r1)(1 + r2)... - 1. */
export function chainReturns(returns: readonly number[]): number {
  return returns.reduce((growth, r) => growth * (1 + r), 1) - 1;
}

/**
 * Blends several accounts' rows into one row per day for a member.
 *
 * Days are weighted by each account's share of the starting balance. If any
 * account's weight is unknown on a day, the accounts count equally that day.
 * An account that has reported before but is missing a day is counted as flat
 * at its last known weight, and the day is marked partial.
 */
export function combineAccounts(
  accounts: readonly (readonly DailyReturnRow[])[],
): DailyReturnRow[] {
  const perAccount = accounts.map((rows) => uniqueByDate(rows));
  const dates = [
    ...new Set(perAccount.flatMap((rows) => rows.map((r) => r.date))),
  ].sort();
  const cursor = perAccount.map(() => 0);
  const lastWeight: (number | null | undefined)[] = perAccount.map(
    () => undefined,
  );

  return dates.map((date) => {
    type Part = { r: number; w: number | null | undefined; f: number };
    const parts: Part[] = [];
    let partial = false;
    perAccount.forEach((rows, i) => {
      const row = rows[cursor[i]];
      if (row && row.date === date) {
        cursor[i]++;
        lastWeight[i] = row.weight;
        parts.push({ r: row.dailyReturn, w: row.weight, f: row.flowRate ?? 0 });
        partial ||= row.partial;
      } else if (cursor[i] > 0) {
        // Reported before, silent today: flat, and the day is incomplete.
        parts.push({ r: 0, w: lastWeight[i], f: 0 });
        partial = true;
      }
    });
    const known = parts.every((p) => typeof p.w === "number" && p.w >= 0);
    const total = known
      ? parts.reduce((sum, p) => sum + (p.w as number), 0)
      : 0;
    const share = (p: Part) =>
      total > 0 ? (p.w as number) / total : 1 / parts.length;
    return {
      date,
      dailyReturn: parts.reduce((sum, p) => sum + p.r * share(p), 0),
      flowRate: parts.reduce((sum, p) => sum + p.f * share(p), 0),
      partial,
    };
  });
}

/**
 * The first return date that counts for a member in a quarter.
 *
 * A return dated D runs from the close of D-1 to the close of D. Someone who
 * was already a member when the quarter began is scored from its first day.
 * Someone who joins during the quarter, its first day included, starts at 0% on their join day, so their
 * first counted return is the day after.
 */
export function firstScoredDate(quarter: Quarter, joinedOn: string): string {
  return joinedOn >= quarter.start ? addDays(joinedOn, 1) : quarter.start;
}

export type Score = {
  /** Chained return over the scored days, as a fraction. Null with no data. */
  value: number | null;
  /** True when a counted day was incomplete or missing. */
  partial: boolean;
  daysScored: number;
  daysMissing: number;
};

/**
 * A member's score for a quarter as of a given day.
 * Missing days count as flat and mark the score as partial.
 */
export function quarterScore(input: {
  rows: readonly DailyReturnRow[];
  quarter: Quarter;
  joinedOn: string;
  asOf: string;
}): Score {
  const { rows, quarter, joinedOn, asOf } = input;
  const from = firstScoredDate(quarter, joinedOn);
  const to = asOf < quarter.end ? asOf : quarter.end;
  return windowScore(rows, from, to);
}

/** Chained return over an inclusive date window, for example the last 7 days. */
export function windowScore(
  rows: readonly DailyReturnRow[],
  from: string,
  to: string,
): Score {
  const counted = uniqueByDate(rows).filter(
    (r) => r.date >= from && r.date <= to,
  );
  const expected = daysInclusive(from, to);
  const daysMissing = Math.max(0, expected - counted.length);
  return {
    value:
      counted.length > 0
        ? chainReturns(counted.map((r) => r.dailyReturn))
        : null,
    partial: daysMissing > 0 || counted.some((r) => r.partial),
    daysScored: counted.length,
    daysMissing,
  };
}

/**
 * The running score after each day in a window, for drawing a member's line.
 * Starts with a 0% point on the day before the first scored date.
 */
export function cumulativeSeries(
  rows: readonly DailyReturnRow[],
  from: string,
  to: string,
): { date: string; value: number; partial: boolean }[] {
  const byDate = new Map(uniqueByDate(rows).map((r) => [r.date, r]));
  const points = [{ date: addDays(from, -1), value: 0, partial: false }];
  let growth = 1;
  for (let date = from; date <= to; date = addDays(date, 1)) {
    const row = byDate.get(date);
    if (row) growth *= 1 + row.dailyReturn;
    points.push({ date, value: growth - 1, partial: !row || row.partial });
  }
  return points;
}

export type StandingInput = {
  userId: string;
  name: string;
  score: Score;
  /** True when the member's brokerage connection needs to be restored. */
  paused: boolean;
};

export type Standing = StandingInput & {
  /** Null when the member is paused or has no score yet. */
  rank: number | null;
};

/**
 * A return in hundredths of a percent, rounded exactly as it is displayed.
 * Ranking and display both go through this, so equal-looking scores tie.
 */
export function shownHundredths(value: number): number {
  return Math.round(Number((value * 100).toFixed(2)) * 100) + 0;
}
const shown = shownHundredths;

/**
 * Orders a league. Ranked members come first, best return first, and members
 * whose shown returns are equal share a rank. Paused members and members with
 * no score yet keep their place in the list but hold no rank.
 */
export function rankStandings(members: readonly StandingInput[]): Standing[] {
  const isRanked = (m: StandingInput) =>
    !m.paused && m.score.value !== null && Number.isFinite(m.score.value);
  const byName = (a: StandingInput, b: StandingInput) =>
    a.name.localeCompare(b.name);
  const value = (m: StandingInput) =>
    m.score.value !== null && Number.isFinite(m.score.value)
      ? shown(m.score.value)
      : Number.NEGATIVE_INFINITY;
  const byScore = (a: StandingInput, b: StandingInput) =>
    (value(a) === value(b) ? 0 : value(b) - value(a)) || byName(a, b);

  const ranked = members.filter(isRanked).sort(byScore);
  const unranked = members.filter((m) => !isRanked(m)).sort(byScore);

  const standings: Standing[] = [];
  ranked.forEach((member, index) => {
    const previous = standings[index - 1];
    const tied =
      previous &&
      shown(previous.score.value as number) ===
        shown(member.score.value as number);
    standings.push({ ...member, rank: tied ? previous.rank : index + 1 });
  });
  return [...standings, ...unranked.map((m) => ({ ...m, rank: null }))];
}

/**
 * How far each member moved since an earlier ranking. Positive means up.
 *
 * Only members ranked in both are compared, so a place gained because someone
 * paused, or lost because someone joined, does not count as a move.
 */
export function rankMoves(
  current: readonly Standing[],
  earlier: readonly Standing[],
): Map<string, number | null> {
  const rankedNow = new Set(
    current.filter((s) => s.rank !== null).map((s) => s.userId),
  );
  const rankedThen = new Set(
    earlier.filter((s) => s.rank !== null).map((s) => s.userId),
  );
  const both = (s: Standing) =>
    rankedNow.has(s.userId) && rankedThen.has(s.userId);
  const place = (list: readonly Standing[]) =>
    new Map(rankStandings(list.filter(both)).map((s) => [s.userId, s.rank]));
  const now = place(current);
  const then = place(earlier);
  return new Map(
    current.map((s) => {
      const a = now.get(s.userId);
      const b = then.get(s.userId);
      return [s.userId, a == null || b == null ? null : b - a];
    }),
  );
}
