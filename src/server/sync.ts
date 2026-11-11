import "server-only";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import type { BadgeKey } from "@/lib/badges";
import { ACTIVITY_LOOKBACK_DAYS } from "@/lib/sync-math";
import { addDays, toDateString } from "@/lib/quarters";
import type { SnapTradeConfig } from "./env";
import {
  ReconnectNeeded,
  Unauthorized,
  withAccessToken,
} from "./snaptrade/access";
import { SnapTradeApi } from "./snaptrade/api";
import { refreshTokens } from "./snaptrade/oauth";
import { pauseForReconnect, tokenStore } from "./snaptrade/token-store";
import { planSync, type FetchedAccount } from "@/lib/sync-plan";

/** Accounts read per person, to stay inside a Worker's request budget. */
const MAX_ACCOUNTS = 8;
/** D1 allows 100 bound values per statement. */
const MAX_PARAMS = 90;

export type SyncResult = "synced" | "reconnect" | "busy";

function chunks<T>(items: readonly T[], columns: number): T[][] {
  const size = Math.max(1, Math.floor(MAX_PARAMS / columns));
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size));
  }
  return out;
}

/** Reads everything one sync needs from SnapTrade with a single access token. */
async function fetchAll(
  accessToken: string,
  today: string,
): Promise<{ accounts: FetchedAccount[]; listedIds: string[] }> {
  const api = new SnapTradeApi(accessToken);
  const [accounts, connections] = await Promise.all([
    api.accounts(),
    api.connections(),
  ]);
  const disabled = new Set(
    connections.filter((c) => c.disabled).map((c) => c.id),
  );
  const since = addDays(today, -ACTIVITY_LOOKBACK_DAYS);
  // A 401 has to reach the caller so the token is refreshed. Any other
  // failure on one account leaves that account's day marked partial.
  const orNull = async <T>(work: Promise<T>): Promise<T | null> => {
    try {
      return await work;
    } catch (error) {
      if (error instanceof Unauthorized) throw error;
      console.error("SnapTrade read failed", error);
      return null;
    }
  };
  const read = await Promise.all(
    accounts.slice(0, MAX_ACCOUNTS).map(async (a) => {
      const connected =
        a.connectionId === null || !disabled.has(a.connectionId);
      const [activities, positions] = connected
        ? await Promise.all([
            orNull(api.activities(a.id, since)),
            a.holdingsAvailable ? orNull(api.positions(a.id)) : null,
          ])
        : [null, null];
      return {
        id: a.id,
        label: `${a.institution} ${a.name}`.trim().slice(0, 60) || "Account",
        isPaper: a.isPaper,
        connected,
        balance: a.balance,
        transactionsThrough: a.transactionsReady ? a.transactionsThrough : null,
        activities,
        positions,
      };
    }),
  );
  return { accounts: read, listedIds: accounts.map((a) => a.id) };
}

/**
 * Takes the right to sync a person. False when another sync started within
 * `minGapMs`, so a page view and the nightly job never overlap.
 */
async function claimSync(userId: string, minGapMs: number): Promise<boolean> {
  const db = await getDb();
  const now = new Date();
  const claimed = await db
    .update(t.users)
    .set({ syncClaimedAt: now })
    .where(
      and(
        eq(t.users.id, userId),
        or(
          isNull(t.users.syncClaimedAt),
          lt(t.users.syncClaimedAt, new Date(now.getTime() - minGapMs)),
        ),
      ),
    )
    .returning({ id: t.users.id });
  return claimed.length === 1;
}

/**
 * Brings one person up to date: reads their accounts from SnapTrade, records
 * today's balance, rebuilds the last few days of returns, and refreshes
 * their habits and badges. Safe to run more than once a day.
 */
export async function syncUser(
  userId: string,
  config: SnapTradeConfig,
  options: { minGapMs?: number } = {},
): Promise<SyncResult> {
  if (!(await claimSync(userId, options.minGapMs ?? 60_000))) return "busy";
  const today = toDateString(new Date());
  const store = tokenStore(userId, config.encryptionKey);

  let fetched: FetchedAccount[];
  let listedIds: string[];
  try {
    ({ accounts: fetched, listedIds } = await withAccessToken(
      store,
      (refreshToken) => refreshTokens(config, refreshToken),
      (accessToken) => fetchAll(accessToken, today),
    ));
  } catch (error) {
    if (error instanceof ReconnectNeeded) {
      // Covers a person whose tokens are gone altogether: still paused.
      await pauseForReconnect(userId);
      return "reconnect";
    }
    throw error;
  }

  const db = await getDb();
  const ids = fetched.map((a) => a.id);
  const [owned, clashing, storedFacts, user, heldBadges, snapshots] = await Promise.all([
    db.select().from(t.accounts).where(eq(t.accounts.userId, userId)),
    ids.length === 0
      ? []
      : db
          .select({ id: t.accounts.id })
          .from(t.accounts)
          .where(and(inArray(t.accounts.id, ids), ne(t.accounts.userId, userId))),
    db.select().from(t.userFacts).where(eq(t.userFacts.userId, userId)),
    db
      .select({ pausedSince: t.users.pausedSince })
      .from(t.users)
      .where(eq(t.users.id, userId)),
    db
      .select({ key: t.badges.badgeKey })
      .from(t.badges)
      .where(eq(t.badges.userId, userId)),
    db
      .select()
      .from(t.balanceSnapshots)
      .where(
        inArray(
          t.balanceSnapshots.accountId,
          db
            .select({ id: t.accounts.id })
            .from(t.accounts)
            .where(eq(t.accounts.userId, userId)),
        ),
      ),
  ]);
  // The person deleted their data while this sync was reading. Write nothing.
  if (user.length === 0) return "busy";
  // An account id that already belongs to someone else is never taken over.
  const taken = new Set(clashing.map((c) => c.id));
  const mine = fetched.filter((a) => !taken.has(a.id));
  const ownedIds = owned.map((a) => a.id);

  const plan = planSync({
    today,
    fetched: mine,
    storedAccounts: owned,
    snapshots,
    storedFacts: storedFacts[0] ?? null,
    pausedSince: user[0].pausedSince,
    listedIds,
    heldBadges: heldBadges.map((b) => b.key as BadgeKey),
  });

  const now = new Date();
  const writes = [];
  for (const group of chunks(plan.accounts, 6)) {
    writes.push(
      db
        .insert(t.accounts)
        .values(
          group.map((a) => ({
            id: a.id,
            userId,
            label: a.label,
            counted: a.countedIfNew,
            connected: a.connected,
            lastSyncedOn: a.lastSyncedOn,
          })),
        )
        .onConflictDoUpdate({
          target: t.accounts.id,
          set: {
            label: sql`excluded.label`,
            connected: sql`excluded.connected`,
            lastSyncedOn: sql`excluded.last_synced_on`,
          },
          setWhere: eq(t.accounts.userId, userId),
        }),
    );
  }
  if (plan.goneAccountIds.length > 0) {
    writes.push(
      db
        .update(t.accounts)
        .set({ connected: false, counted: false })
        .where(
          and(
            eq(t.accounts.userId, userId),
            inArray(t.accounts.id, plan.goneAccountIds.slice(0, 80)),
          ),
        ),
    );
  }
  for (const group of chunks(plan.snapshots, 3)) {
    writes.push(
      db
        .insert(t.balanceSnapshots)
        .values(group)
        .onConflictDoUpdate({
          target: [t.balanceSnapshots.accountId, t.balanceSnapshots.date],
          set: { balance: sql`excluded.balance` },
        }),
    );
  }
  for (const group of chunks(plan.returns, 6)) {
    writes.push(
      db
        .insert(t.dailyReturns)
        .values(
          group.map((r) => ({
            accountId: r.accountId,
            date: r.date,
            dailyReturn: r.dailyReturn,
            partial: r.partial,
            weight: r.weight ?? null,
            flowRate: r.flowRate ?? 0,
          })),
        )
        .onConflictDoUpdate({
          target: [t.dailyReturns.accountId, t.dailyReturns.date],
          set: {
            dailyReturn: sql`excluded.daily_return`,
            partial: sql`excluded.partial`,
            weight: sql`excluded.weight`,
            flowRate: sql`excluded.flow_rate`,
          },
        }),
    );
  }
  if (ids.length > 0 || ownedIds.length > 0) {
    // Balances are the only dollar amounts stored, and only briefly. Each
    // account keeps its latest one so a reconnect can pick up where it left.
    writes.push(
      db.delete(t.balanceSnapshots).where(sql`
        account_id in (select id from accounts where user_id = ${userId})
        and date < ${plan.pruneBefore}
        and date < (
          select max(b.date) from balance_snapshots b
          where b.account_id = balance_snapshots.account_id
        )`),
    );
  }
  if (plan.freeze) {
    writes.push(
      db
        .insert(t.quarterSnapshots)
        .values({ userId, ...plan.freeze })
        .onConflictDoNothing(),
    );
  }
  if (plan.facts) {
    const values = { ...plan.facts, updatedAt: now };
    writes.push(
      db
        .insert(t.userFacts)
        .values({ userId, ...values })
        .onConflictDoUpdate({ target: t.userFacts.userId, set: values }),
    );
  }
  if (plan.badges.length > 0) {
    writes.push(
      db
        .insert(t.badges)
        .values(
          plan.badges.map((b) => ({
            userId,
            badgeKey: b.key,
            quarter: b.quarter,
            earnedOn: b.earnedOn,
          })),
        )
        .onConflictDoNothing(),
    );
  }
  writes.push(
    db
      .update(t.users)
      .set({
        // If the connection was cut while this sync was reading, by a
        // disconnect or a failed refresh, the pause that set stays in place.
        pausedSince: sql`case when exists (
            select 1 from oauth_tokens o
            where o.user_id = ${userId} and o.status <> 'needs_reconnect')
          then ${plan.pausedSince}
          else coalesce(${t.users.pausedSince}, ${today}) end`,
        lastSyncedAt: now,
      })
      .where(eq(t.users.id, userId)),
  );
  // One batch: either the whole day is recorded or none of it is.
  const [first, ...rest] = writes;
  await db.batch([first, ...rest]);
  return "synced";
}

/** How many people one invocation hands out, inside a Worker's request budget. */
export const SYNC_BATCH = 40;

/**
 * People whose connection still works and who have not been tried in the
 * last six hours, longest-waiting first. Ordering by the last attempt, not
 * the last success, keeps a person whose sync keeps failing from holding
 * the front of the line.
 */
export async function usersToSync(): Promise<string[]> {
  const db = await getDb();
  const rows = await db
    .select({ id: t.users.id })
    .from(t.users)
    .innerJoin(t.oauthTokens, eq(t.oauthTokens.userId, t.users.id))
    .where(
      and(
        ne(t.oauthTokens.status, "needs_reconnect"),
        or(
          isNull(t.users.syncClaimedAt),
          lt(t.users.syncClaimedAt, new Date(Date.now() - 6 * 3_600_000)),
        ),
      ),
    )
    .orderBy(t.users.syncClaimedAt)
    .limit(SYNC_BATCH);
  return rows.map((r) => r.id);
}
