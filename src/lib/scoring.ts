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
  weight?: number;
};

/**
 * One day's return for one account, with cash flows removed.
 * `netDeposits` is deposits minus withdrawals during the day.
 *
 * Returns null when there is no starting balance to measure against,
 * for example on the day an empty account receives its first deposit.
 */
export function dailyReturn(input: {
  previousBalance: number;
  balance: number;
  netDeposits: number;
}): number | null {
  const { previousBalance, balance, netDeposits } = input;
  if (!Number.isFinite(previousBalance) || previousBalance <= 0) return null;
  return (balance - previousBalance - netDeposits) / previousBalance;
}

/** Chains daily returns into one return: (1 + r1)(1 + r2)... - 1. */
export function chainReturns(returns: readonly number[]): number {
  return returns.reduce((growth, r) => growth * (1 + r), 1) - 1;
}

/**
 * Blends several accounts' rows into one row per day for a member.
 * Days are weighted by each account's share of the starting balance.
 * If no weights are known for a day, the accounts count equally.
 */
export function combineAccounts(
  accounts: readonly (readonly DailyReturnRow[])[],
): DailyReturnRow[] {
  const byDate = new Map<string, DailyReturnRow[]>();
  for (const rows of accounts) {
    for (const row of rows) {
      const list = byDate.get(row.date);
      if (list) list.push(row);
      else byDate.set(row.date, [row]);
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([date, rows]) => {
      const totalWeight = rows.reduce((sum, r) => sum + (r.weight ?? 0), 0);
      const blended =
        totalWeight > 0
          ? rows.reduce((sum, r) => sum + r.dailyReturn * (r.weight ?? 0), 0) /
            totalWeight
          : rows.reduce((sum, r) => sum + r.dailyReturn, 0) / rows.length;
      return {
        date,
        dailyReturn: blended,
        partial: rows.some((r) => r.partial),
      };
    });
}

/**
 * The first return date that counts for a member in a quarter.
 *
 * A return dated D runs from the close of D-1 to the close of D. Someone who
 * was already a member when the quarter began is scored from its first day.
 * Someone who joins mid-quarter starts at 0% on their join day, so their
 * first counted return is the day after.
 */
export function firstScoredDate(quarter: Quarter, joinedOn: string): string {
  return joinedOn > quarter.start ? addDays(joinedOn, 1) : quarter.start;
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
  const seen = new Set<string>();
  const counted = rows.filter((r) => {
    if (r.date < from || r.date > to || seen.has(r.date)) return false;
    seen.add(r.date);
    return true;
  });
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
  const byDate = new Map(rows.map((r) => [r.date, r]));
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

/** Scores are compared at the precision they are shown at: 0.01%. */
const shown = (value: number) => Math.round(value * 10_000);

/**
 * Orders a league. Ranked members come first, best return first, and members
 * whose shown returns are equal share a rank. Paused members and members with
 * no score yet keep their place in the list but hold no rank.
 */
export function rankStandings(members: readonly StandingInput[]): Standing[] {
  const isRanked = (m: StandingInput) => !m.paused && m.score.value !== null;
  const byName = (a: StandingInput, b: StandingInput) =>
    a.name.localeCompare(b.name);
  const byScore = (a: StandingInput, b: StandingInput) =>
    shown(b.score.value ?? -Infinity) - shown(a.score.value ?? -Infinity) ||
    byName(a, b);

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
 * Null when the member holds no rank now or held none before.
 */
export function rankMoves(
  current: readonly Standing[],
  earlier: readonly Standing[],
): Map<string, number | null> {
  const before = new Map(earlier.map((s) => [s.userId, s.rank]));
  return new Map(
    current.map((s) => {
      const was = before.get(s.userId) ?? null;
      return [s.userId, s.rank === null || was === null ? null : was - s.rank];
    }),
  );
}
