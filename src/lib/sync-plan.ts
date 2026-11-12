/**
 * Works out what one sync should write, from what SnapTrade reported and
 * what is already stored. Pure: no database, no network.
 */

import { backfill, type HistoryPoint } from "./backfill";
import { badgeStatuses, type BadgeKey, type HabitFacts } from "./badges";
import { addDays, previousQuarter, quarterOf } from "./quarters";
import type { DailyReturnRow } from "./scoring";
import {
  BALANCE_WINDOW_DAYS,
  buildFacts,
  currentPrices,
  firstSeenDays,
  flowsByDay,
  recomputeWindow,
  weightsFor,
  type Activity,
  type Position,
  type Snapshot,
} from "./sync-math";

export type FetchedAccount = {
  id: string;
  label: string;
  isPaper: boolean;
  /** True when the brokerage reports the account as closed or archived. */
  closed?: boolean;
  /** False when the brokerage connection behind the account is disabled. */
  connected: boolean;
  balance: number | null;
  /** Transactions are known through this day. Null when that is unknown. */
  transactionsThrough: string | null;
  /** Null when the transactions could not be read this time. */
  activities: Activity[] | null;
  /** Null when the positions could not be read this time. */
  positions: Position[] | null;
  /**
   * The brokerage's estimated value history, for filling in the days before
   * Holdfast was watching. Left out when this sync did not ask for it,
   * "unavailable" when the brokerage or the app does not offer one, and null
   * when the read failed and should be tried again.
   */
  history?: HistoryPoint[] | "unavailable" | null;
};

export type StoredAccount = {
  id: string;
  counted: boolean;
  lastSyncedOn: string | null;
  historyCheckedOn?: string | null;
  historyFrom?: string | null;
};

export type StoredFacts = {
  facts: HabitFacts;
  quarter: string;
  startPrices: Record<string, number>;
  firstSeen: Record<string, string>;
};

export type SyncInput = {
  today: string;
  fetched: readonly FetchedAccount[];
  storedAccounts: readonly StoredAccount[];
  /** Stored balances inside the window, for this person's accounts. */
  snapshots: readonly (Snapshot & { accountId: string })[];
  storedFacts: StoredFacts | null;
  pausedSince: string | null;
  /**
   * Every account id SnapTrade listed, including any that were not read
   * this time. Defaults to the ids in `fetched`.
   */
  listedIds?: readonly string[];
  /**
   * The first day each account has a return Holdfast measured itself, by
   * account id. Estimates are only ever written before that day.
   */
  firstMeasured?: Readonly<Record<string, string>>;
  /** Badges the person already holds, from any quarter. */
  heldBadges?: readonly BadgeKey[];
};

export type SyncPlan = {
  accounts: {
    id: string;
    label: string;
    /** Used only when the account is new. The owner's choice is kept. */
    countedIfNew: boolean;
    connected: boolean;
    lastSyncedOn: string | null;
    historyCheckedOn: string | null;
    historyFrom: string | null;
  }[];
  /**
   * Stored accounts SnapTrade no longer lists: the person removed them
   * there. They stop counting, so they cannot hold a rank paused for good.
   */
  goneAccountIds: string[];
  /**
   * Stored accounts that never synced a balance and were not read this
   * time: no longer listed, not an investment account, or closed. They hold
   * nothing worth keeping, so they are removed outright.
   */
  forgetAccountIds: string[];
  snapshots: { accountId: string; date: string; balance: number }[];
  returns: (DailyReturnRow & { accountId: string })[];
  /**
   * Estimated returns for days before Holdfast was watching an account.
   * They replace earlier estimates for the same days and nothing else, so a
   * measured day is never replaced by an estimate.
   */
  backfill: (DailyReturnRow & { accountId: string })[];
  /** Null when facts could not be rebuilt and the stored ones should stay. */
  facts: StoredFacts | null;
  /** The quarter that just ended, frozen for its Wrapped. */
  freeze: { quarter: string; facts: HabitFacts } | null;
  badges: { key: BadgeKey; quarter: string; earnedOn: string }[];
  pausedSince: string | null;
  /** Snapshots dated before this are deleted, except each account's latest. */
  pruneBefore: string;
};

export function planSync(input: SyncInput): SyncPlan {
  const { today, storedAccounts, storedFacts } = input;
  const stored = new Map(storedAccounts.map((a) => [a.id, a]));
  // A closed account is only followed if it has history here: it then winds
  // down to nothing like any other, and what it earned stays in the score.
  // One that was closed before it ever synced has nothing to add.
  const fetched = input.fetched.filter(
    (a) => !a.closed || Boolean(stored.get(a.id)?.lastSyncedOn),
  );
  const quarter = quarterOf(today);
  const windowStart = addDays(today, -BALANCE_WINDOW_DAYS);

  const accounts: SyncPlan["accounts"] = [];
  const snapshots: SyncPlan["snapshots"] = [];
  const perAccount = new Map<string, Snapshot[]>();
  const rowsByAccount = new Map<string, DailyReturnRow[]>();
  const filled = new Map<string, { rows: DailyReturnRow[]; points: Snapshot[] }>();

  for (const account of fetched) {
    const before = stored.get(account.id);
    const usable = account.connected && account.balance !== null;
    const history: Snapshot[] = input.snapshots
      .filter((s) => s.accountId === account.id && s.date < today)
      .map((s) => ({ date: s.date, balance: s.balance }));
    if (usable) {
      const balance = account.balance as number;
      snapshots.push({ accountId: account.id, date: today, balance });
      history.push({ date: today, balance });
    }
    perAccount.set(account.id, history);

    let historyCheckedOn = before?.historyCheckedOn ?? null;
    let historyFrom = before?.historyFrom ?? null;
    if (historyFrom === null && account.history === "unavailable") {
      historyCheckedOn = today;
    } else if (
      // An account that was filled in before is worked out again whenever
      // its history was read, which happens when another account needs
      // filling. Every account's share of each day then comes from the same
      // set of balances.
      Array.isArray(account.history) &&
      // Without settled transactions a deposit cannot be told from a gain,
      // so the backfill waits for a sync that has them.
      account.activities !== null &&
      account.transactionsThrough !== null
    ) {
      const firstMeasured = input.firstMeasured?.[account.id] ?? null;
      let joinAt: Snapshot | null = null;
      if (!firstMeasured) {
        for (const s of history) if (!joinAt || s.date < joinAt.date) joinAt = s;
      }
      const result = backfill({
        history: account.history,
        activities: account.activities,
        transactionsThrough: account.transactionsThrough,
        today,
        joinAt,
        // A measured return dated D runs from the close of D-1.
        through: firstMeasured ? addDays(firstMeasured, -1) : null,
      });
      historyCheckedOn = today;
      if (result.rows.length > 0) {
        const first = result.rows[0].date;
        historyFrom = historyFrom !== null && historyFrom < first ? historyFrom : first;
        filled.set(account.id, result);
      }
    }
    accounts.push({
      id: account.id,
      label: account.label,
      countedIfNew: !account.isPaper,
      connected: account.connected,
      lastSyncedOn: usable ? today : (before?.lastSyncedOn ?? null),
      historyCheckedOn,
      historyFrom,
    });
    if (history.length < 2) continue;
    const { flows, unclear } = flowsByDay(account.activities ?? []);
    const rows = recomputeWindow(
      history,
      flows,
      account.activities === null ? null : account.transactionsThrough,
      unclear,
    );
    rowsByAccount.set(
      account.id,
      rows.filter((r) =>
        account.activities === null
          ? // Without transactions a deposit cannot be told from a gain, so
            // only today is written, marked partial, and settled days that
            // were worked out with transactions are left as they are.
            usable && r.date === today
          : // Only days inside the window are rewritten. A catch-up after a
            // long disconnect keeps its flat days out of settled history.
            r.date >= windowStart,
      ),
    );
  }

  // Each account's share of the day's starting money, across every account.
  const startingBalance = (accountId: string, date: string): number | null => {
    let latest: Snapshot | null = null;
    for (const s of perAccount.get(accountId) ?? []) {
      if (s.date < date && (!latest || s.date > latest.date)) latest = s;
    }
    return latest ? latest.balance : null;
  };
  const dates = new Set<string>();
  for (const rows of rowsByAccount.values()) {
    for (const r of rows) dates.add(r.date);
  }
  const weights = new Map<string, Map<string, number | null>>();
  for (const date of dates) {
    const starts = new Map<string, number>();
    for (const [accountId, rows] of rowsByAccount) {
      if (!rows.some((r) => r.date === date)) continue;
      const start = startingBalance(accountId, date);
      if (start !== null) starts.set(accountId, start);
    }
    weights.set(date, weightsFor(starts));
  }
  const returns: SyncPlan["returns"] = [];
  for (const [accountId, rows] of rowsByAccount) {
    for (const r of rows) {
      returns.push({
        ...r,
        accountId,
        weight: weights.get(r.date)?.get(accountId) ?? null,
      });
    }
  }

  // The same shares for the backfilled days, from the estimated balances.
  const backfillRows: SyncPlan["backfill"] = [];
  const filledDates = new Set<string>();
  for (const { rows } of filled.values()) {
    for (const r of rows) filledDates.add(r.date);
  }
  const cursors = new Map([...filled.keys()].map((id) => [id, 0]));
  const filledWeights = new Map<string, Map<string, number | null>>();
  for (const date of [...filledDates].sort()) {
    const starts = new Map<string, number>();
    for (const [accountId, { rows, points }] of filled) {
      if (date < rows[0].date || date > rows[rows.length - 1].date) continue;
      let i = cursors.get(accountId) ?? 0;
      while (i + 1 < points.length && points[i + 1].date < date) i++;
      cursors.set(accountId, i);
      if (points[i].date < date) starts.set(accountId, points[i].balance);
    }
    filledWeights.set(date, weightsFor(starts));
  }
  for (const [accountId, { rows }] of filled) {
    for (const r of rows) {
      backfillRows.push({
        ...r,
        accountId,
        weight: filledWeights.get(r.date)?.get(accountId) ?? null,
      });
    }
  }

  // Habits come from the accounts the person counts, and only when every one
  // of them could be read, so a failed call never wipes a streak.
  const isCounted = (a: FetchedAccount) =>
    stored.get(a.id)?.counted ?? !a.isPaper;
  const counted = fetched.filter((a) => a.connected && isCounted(a));
  const readable =
    counted.length > 0 &&
    counted.every((a) => a.activities !== null && a.positions !== null);

  let facts: StoredFacts | null = null;
  let freeze: SyncPlan["freeze"] = null;
  const turned = storedFacts !== null && storedFacts.quarter !== quarter.key;
  if (readable) {
    const activities = counted.flatMap((a) => a.activities ?? []);
    const positions = counted.flatMap((a) => a.positions ?? []);
    const prices = currentPrices(positions);
    const startPrices =
      storedFacts && storedFacts.quarter === quarter.key
        ? // A holding first seen mid-quarter is measured from when it appeared.
          { ...prices, ...storedFacts.startPrices }
        : prices;
    // How far back each account's history reaches, per symbol it holds.
    const reach: Record<string, string> = {};
    for (const a of counted) {
      let earliest = today;
      for (const act of a.activities ?? []) {
        if (act.date < earliest) earliest = act.date;
      }
      for (const p of a.positions ?? []) {
        if (!(p.symbol in reach) || earliest < reach[p.symbol]) {
          reach[p.symbol] = earliest;
        }
      }
    }
    const firstSeen = firstSeenDays(
      positions,
      storedFacts ? storedFacts.firstSeen : null,
      today,
      reach,
    );
    facts = {
      facts: buildFacts({
        activities,
        positions,
        startPrices,
        firstSeen,
        today,
      }),
      quarter: quarter.key,
      startPrices,
      firstSeen,
    };
  }

  const held = new Set(input.heldBadges ?? []);
  const badges: SyncPlan["badges"] = [];
  const award = (
    habits: HabitFacts,
    of: { key: string; start: string; end: string },
    asOf: string,
  ) => {
    const last = asOf < of.end ? asOf : of.end;
    for (const b of badgeStatuses(habits, quarterOf(of.start), asOf)) {
      if (!b.earned) continue;
      // One Year Hold is earned once, not again every quarter it stays true.
      if (b.key === "one_year_hold" && held.has(b.key)) continue;
      held.add(b.key);
      badges.push({
        key: b.key,
        quarter: of.key,
        earnedOn: clampDay(b.earnedOn ?? last, of.start, last),
      });
    }
  };

  if (turned && storedFacts) {
    // The quarter that just ended is frozen for its Wrapped. Buys and
    // dividends from its last days often arrive after it closes, so its
    // dates are taken from this sync where there is one. Its holdings stay
    // as they were last seen inside the quarter.
    const before = previousQuarter(quarter);
    const closing = storedFacts.quarter === before.key ? before : null;
    const within = (d: string) => closing === null || d <= closing.end;
    const frozen: HabitFacts =
      facts && closing
        ? {
            ...storedFacts.facts,
            buyDates: facts.facts.buyDates.filter(within),
            buyMonths: facts.facts.buyMonths.filter((m) => m <= closing.end.slice(0, 7)),
            dividendDates: facts.facts.dividendDates.filter(within),
          }
        : storedFacts.facts;
    freeze = { quarter: storedFacts.quarter, facts: frozen };
    if (closing) award(frozen, closing, closing.end);
  }
  if (facts) award(facts.facts, quarter, today);

  // A counted account whose connection has dropped pauses the person's
  // rank, from the last day it synced, until it is reconnected or left out
  // of leagues. An account that is no longer listed at all was removed by
  // its owner, so it stops counting instead of pausing them for good.
  const listed = new Set(input.listedIds ?? input.fetched.map((f) => f.id));
  const followed = new Set(fetched.map((f) => f.id));
  const dropped = fetched
    .filter((a) => !a.connected && isCounted(a))
    .map((a) => stored.get(a.id)?.lastSyncedOn ?? today)
    .sort();
  const pausedSince =
    dropped.length === 0 ? null : (input.pausedSince ?? dropped[0]);

  const gone = storedAccounts.filter((a) => !listed.has(a.id));
  return {
    accounts,
    goneAccountIds: gone.filter((a) => a.lastSyncedOn !== null).map((a) => a.id),
    forgetAccountIds: storedAccounts
      .filter((a) => a.lastSyncedOn === null && !followed.has(a.id))
      .map((a) => a.id),
    snapshots,
    returns,
    backfill: backfillRows,
    facts,
    freeze,
    badges,
    pausedSince,
    pruneBefore: windowStart,
  };
}

function clampDay(day: string, min: string, max: string): string {
  return day < min ? min : day > max ? max : day;
}
