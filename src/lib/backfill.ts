/**
 * Turns a brokerage's account value history into daily returns for the days
 * before Holdfast started watching an account. Pure functions, no I/O.
 *
 * SnapTrade estimates an account's total value for each day of the past
 * year. Paired with the account's deposits and withdrawals, that gives the
 * same flow-free daily return a live sync measures. The values themselves
 * are used here and then dropped: only percentages are kept.
 */

import { addDays } from "./quarters";
import { dailyReturn, type DailyReturnRow } from "./scoring";
import { flowsByDay, recomputeWindow, type Activity, type Snapshot } from "./sync-math";

/** SnapTrade's history reaches back one year at most. */
export const HISTORY_MAX_DAYS = 365;
/** The most transactions one sync reads per account. See `SnapTradeApi`. */
export const ACTIVITY_CAP = 3000;

export type HistoryPoint = { date: string; value: number };

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The usable part of a value history: real dates inside the last year, one
 * point per day, oldest first, starting at the first day the account held
 * anything.
 */
export function cleanHistory(
  points: readonly HistoryPoint[],
  today: string,
): Snapshot[] {
  const earliest = addDays(today, -HISTORY_MAX_DAYS);
  const byDate = new Map<string, number>();
  for (const p of points) {
    if (!DAY.test(p.date) || p.date > today || p.date < earliest) continue;
    if (!Number.isFinite(p.value) || p.value < 0) continue;
    byDate.set(p.date, p.value);
  }
  const sorted = [...byDate]
    .map(([date, balance]) => ({ date, balance }))
    .sort((a, b) => (a.date < b.date ? -1 : 1));
  const first = sorted.findIndex((s) => s.balance >= 1);
  return first === -1 ? [] : sorted.slice(first);
}

/**
 * Moves a deposit or withdrawal one step earlier or later when the value
 * history clearly shows the money arriving on a neighbouring day.
 *
 * A transaction's date and the day an estimated balance reflects it can be a
 * day apart. Left alone, that shows up as a sharp fall one day and an equal
 * jump the next. A flow is moved only when doing so removes most of a swing
 * of about its own size, so a real market move is never smoothed away.
 */
export function alignFlows(
  points: readonly Snapshot[],
  flows: ReadonlyMap<string, number>,
): Map<string, number> {
  if (points.length < 2) return new Map(flows);
  // net[i] is the money that moved between points[i] and points[i + 1].
  const net = new Array<number>(points.length - 1).fill(0);
  const stray = new Map<string, number>();
  const intervalOf = (date: string): number => {
    for (let i = 0; i < net.length; i++) {
      if (date > points[i].date && date <= points[i + 1].date) return i;
    }
    return -1;
  };
  const placed: { interval: number; amount: number }[] = [];
  for (const [date, amount] of [...flows].sort((a, b) => (a[0] < b[0] ? -1 : 1))) {
    const i = intervalOf(date);
    if (i === -1) {
      stray.set(date, amount);
      continue;
    }
    net[i] += amount;
    placed.push({ interval: i, amount });
  }
  const size = (i: number): number => {
    if (i < 0 || i >= net.length) return 0;
    const r = dailyReturn({
      previousBalance: points[i].balance,
      balance: points[i + 1].balance,
      netDeposits: net[i],
    });
    return r === null ? 0 : Math.abs(r);
  };
  /** The swing across an interval and its two neighbours. */
  const cost = (i: number) => size(i - 1) + size(i) + size(i + 1);
  for (const flow of placed) {
    const i = flow.interval;
    const base = Math.max(points[i].balance, points[i + 1].balance, 1);
    const weight = Math.abs(flow.amount) / base;
    // Too small to tell apart from an ordinary day's movement.
    if (weight < 0.02) continue;
    const here = cost(i);
    let best = { to: i, cost: here };
    for (const to of [i - 1, i + 1]) {
      if (to < 0 || to >= net.length) continue;
      net[i] -= flow.amount;
      net[to] += flow.amount;
      const moved = cost(i);
      net[to] -= flow.amount;
      net[i] += flow.amount;
      if (moved < best.cost) best = { to, cost: moved };
    }
    if (best.to !== i && here - best.cost > weight) {
      net[i] -= flow.amount;
      net[best.to] += flow.amount;
    }
  }
  const aligned = new Map(stray);
  net.forEach((amount, i) => {
    if (amount !== 0) aligned.set(points[i + 1].date, amount);
  });
  return aligned;
}

export type BackfillInput = {
  /** The value history as SnapTrade reported it. */
  history: readonly HistoryPoint[];
  /** The account's transactions. */
  activities: readonly Activity[];
  /** Transactions are known through this day. Null when that is unknown. */
  transactionsThrough: string | null;
  today: string;
  /**
   * The first balance Holdfast recorded itself, when there is one. The
   * history is used up to that day and no further, because measured days
   * take over from there.
   */
  joinAt: Snapshot | null;
};

export type Backfill = {
  /** Daily returns for the days the history covers, each marked estimated. */
  rows: DailyReturnRow[];
  /** The balances the rows were worked out from. Never stored. */
  points: Snapshot[];
};

/**
 * Rebuilds the days before Holdfast was watching an account. Empty when the
 * history is too thin to give even one return.
 */
export function backfill(input: BackfillInput): Backfill {
  const { activities, joinAt, today } = input;
  let points = cleanHistory(input.history, today);
  if (joinAt) {
    points = points.filter((p) => p.date <= joinAt.date);
    // The history's own value for the joining day is preferred: a return is
    // a ratio, so staying inside one source keeps a difference in level
    // between the estimate and the recorded balance out of the score.
    const last = points.at(-1);
    if (last && last.date < joinAt.date && joinAt.balance >= 0) points.push(joinAt);
  }
  // When the transaction list was cut short, deposits older than its oldest
  // entry are unknown, so the history is only trusted from there on.
  if (activities.length >= ACTIVITY_CAP) {
    let oldest = today;
    for (const a of activities) if (a.date < oldest) oldest = a.date;
    points = points.filter((p) => p.date >= oldest);
  }
  if (points.length < 2) return { rows: [], points: [] };
  const { flows, unclear } = flowsByDay(activities);
  const measured = recomputeWindow(
    points,
    alignFlows(points, flows),
    input.transactionsThrough,
    unclear,
  );
  // A day's return covers everything since the point before it.
  const previous = new Map(points.slice(1).map((p, i) => [p.date, points[i].date]));
  const rows = measured.map((row) => {
    let unexplained = !plausible(row.dailyReturn);
    const from = previous.get(row.date);
    if (from) {
      for (const day of unclear) unexplained ||= day > from && day <= row.date;
    }
    // An estimate cannot tell a transfer of unknown size, or money that
    // moved without a matching transaction, from a gain. Those days count
    // as flat and are marked partial, instead of deciding a league.
    return unexplained
      ? { date: row.date, dailyReturn: 0, flowRate: 0, partial: true, estimated: true }
      : { ...row, estimated: true };
  });
  return { rows, points };
}

/**
 * Whether one day's move could be a real one for a whole account. Past
 * this, an estimated balance is far more likely to be missing a deposit,
 * withdrawal or transfer than to be showing a true result.
 */
function plausible(dailyReturn: number): boolean {
  return dailyReturn <= 0.5 && dailyReturn >= -1 / 3;
}

/** How long to wait before asking again for a history that was not there. */
export const HISTORY_RETRY_DAYS = 1;

/**
 * Whether a sync should ask for an account's value history: it has never
 * been filled in, and it was not already asked for too recently.
 */
export function needsHistory(
  stored: { historyCheckedOn?: string | null; historyFrom?: string | null } | undefined,
  today: string,
): boolean {
  if (!stored) return true;
  if (stored.historyFrom) return false;
  const checked = stored.historyCheckedOn;
  return !checked || checked <= addDays(today, -HISTORY_RETRY_DAYS);
}
