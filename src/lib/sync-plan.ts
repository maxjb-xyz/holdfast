/**
 * Works out what one sync should write, from what SnapTrade reported and
 * what is already stored. Pure: no database, no network.
 */

import { badgeStatuses, type BadgeKey, type HabitFacts } from "./badges";
import { addDays, quarterOf } from "./quarters";
import type { DailyReturnRow } from "./scoring";
import {
  BALANCE_WINDOW_DAYS,
  buildFacts,
  currentPrices,
  firstSeenDays,
  netDepositsByDay,
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
  /** False when the brokerage connection behind the account is disabled. */
  connected: boolean;
  balance: number | null;
  /** Transactions are known through this day. Null when that is unknown. */
  transactionsThrough: string | null;
  /** Null when the transactions could not be read this time. */
  activities: Activity[] | null;
  /** Null when the positions could not be read this time. */
  positions: Position[] | null;
};

export type StoredAccount = {
  id: string;
  counted: boolean;
  lastSyncedOn: string | null;
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
};

export type SyncPlan = {
  accounts: {
    id: string;
    label: string;
    /** Used only when the account is new. The owner's choice is kept. */
    countedIfNew: boolean;
    connected: boolean;
    lastSyncedOn: string | null;
  }[];
  /** Stored accounts SnapTrade no longer lists. */
  goneAccountIds: string[];
  snapshots: { accountId: string; date: string; balance: number }[];
  returns: (DailyReturnRow & { accountId: string })[];
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
  const { today, fetched, storedAccounts, storedFacts } = input;
  const stored = new Map(storedAccounts.map((a) => [a.id, a]));
  const quarter = quarterOf(today);
  const windowStart = addDays(today, -BALANCE_WINDOW_DAYS);

  const accounts: SyncPlan["accounts"] = [];
  const snapshots: SyncPlan["snapshots"] = [];
  const perAccount = new Map<string, Snapshot[]>();
  const rowsByAccount = new Map<string, DailyReturnRow[]>();

  for (const account of fetched) {
    const before = stored.get(account.id);
    const usable = account.connected && account.balance !== null;
    accounts.push({
      id: account.id,
      label: account.label,
      countedIfNew: !account.isPaper,
      connected: account.connected,
      lastSyncedOn: usable ? today : (before?.lastSyncedOn ?? null),
    });
    const history: Snapshot[] = input.snapshots
      .filter((s) => s.accountId === account.id && s.date < today)
      .map((s) => ({ date: s.date, balance: s.balance }));
    if (usable) {
      const balance = account.balance as number;
      snapshots.push({ accountId: account.id, date: today, balance });
      history.push({ date: today, balance });
    }
    perAccount.set(account.id, history);
    if (history.length < 2) continue;
    const flows = netDepositsByDay(account.activities ?? []);
    const rows = recomputeWindow(
      history,
      flows,
      account.activities === null ? null : account.transactionsThrough,
    );
    // Only days inside the window are rewritten. A catch-up after a long
    // disconnect keeps its flat days out of history that is already settled.
    rowsByAccount.set(
      account.id,
      rows.filter((r) => r.date >= windowStart),
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
  if (storedFacts && storedFacts.quarter !== quarter.key) {
    freeze = { quarter: storedFacts.quarter, facts: storedFacts.facts };
  }
  if (readable) {
    const activities = counted.flatMap((a) => a.activities ?? []);
    const positions = counted.flatMap((a) => a.positions ?? []);
    const prices = currentPrices(positions);
    const startPrices =
      storedFacts && storedFacts.quarter === quarter.key
        ? // A holding first seen mid-quarter is measured from when it appeared.
          { ...prices, ...storedFacts.startPrices }
        : prices;
    const firstSeen = firstSeenDays(
      positions,
      storedFacts?.firstSeen ?? {},
      today,
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

  const badges = facts
    ? badgeStatuses(facts.facts, quarter, today)
        .filter((b) => b.earned)
        .map((b) => ({
          key: b.key,
          quarter: quarter.key,
          earnedOn: clampDay(b.earnedOn ?? today, quarter.start, today),
        }))
    : [];

  // A counted account that has dropped pauses the person's rank, from the
  // last day it synced, until it is reconnected or left out of leagues.
  const dropped = [
    ...fetched
      .filter((a) => !a.connected && isCounted(a))
      .map((a) => stored.get(a.id)?.lastSyncedOn ?? today),
    ...storedAccounts
      .filter((a) => a.counted && !fetched.some((f) => f.id === a.id))
      .map((a) => a.lastSyncedOn ?? today),
  ].sort();
  const pausedSince =
    dropped.length === 0 ? null : (input.pausedSince ?? dropped[0]);

  return {
    accounts,
    goneAccountIds: storedAccounts
      .filter((a) => !fetched.some((f) => f.id === a.id))
      .map((a) => a.id),
    snapshots,
    returns,
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
