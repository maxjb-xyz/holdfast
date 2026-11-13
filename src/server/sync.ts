import "server-only";
import { and, eq, inArray, isNull, lt, ne, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { batchStatements } from "@/db/batch";
import * as t from "@/db/schema";
import { accountLabel } from "@/lib/account-label";
import type { BadgeKey } from "@/lib/badges";
import { needsHistory } from "@/lib/backfill";
import { ACTIVITY_LOOKBACK_DAYS } from "@/lib/sync-math";
import { addDays, toDateString } from "@/lib/quarters";
import type { SnapTradeConfig } from "./env";
import {
  ReconnectNeeded,
  Unauthorized,
  withAccessToken,
} from "./snaptrade/access";
import { SnapTradeApi, type SnapAccount } from "./snaptrade/api";
import { refreshTokens } from "./snaptrade/oauth";
import { pauseForReconnect, tokenStore } from "./snaptrade/token-store";
import { planSync, type FetchedAccount } from "@/lib/sync-plan";

/** Accounts read per person, to stay inside a Worker's request budget. */
const MAX_ACCOUNTS = 12;
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
  wantsHistory: (accountId: string) => boolean,
): Promise<{ accounts: FetchedAccount[]; listedIds: string[] }> {
  const api = new SnapTradeApi(accessToken);
  const [listed, connections] = await Promise.all([
    api.accounts(),
    api.connections(),
  ]);
  // Leagues score investments. Bank accounts, loans and the like that came
  // along with a connection are left out.
  const closed = (a: SnapAccount) =>
    a.status === "closed" || a.status === "archived";
  // If the cap ever bites, paper and closed accounts are the ones dropped.
  const rank = (a: SnapAccount) => (closed(a) ? 2 : a.isPaper ? 1 : 0);
  const accounts = listed
    .filter((a) => a.kind === "investment")
    .sort((a, b) => rank(a) - rank(b));
  if (accounts.length > MAX_ACCOUNTS) {
    console.warn(
      `sync read ${MAX_ACCOUNTS} of ${accounts.length} investment accounts`,
    );
  }
  const disabled = new Set(
    connections.filter((c) => c.disabled).map((c) => c.id),
  );
  const brokerages = new Map(connections.map((c) => [c.id, c.brokerage]));
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
  // When one account needs its history, every account's is read, so each
  // account's share of a past day is worked out from all of them together.
  const readHistory = accounts
    .slice(0, MAX_ACCOUNTS)
    .some((a) => wantsHistory(a.id));
  const read = await Promise.all(
    accounts.slice(0, MAX_ACCOUNTS).map(async (a) => {
      const connected =
        a.connectionId === null || !disabled.has(a.connectionId);
      const institution =
        a.institution ??
        (a.connectionId ? brokerages.get(a.connectionId) : null) ??
        null;
      const [activities, positions, history] = connected
        ? await Promise.all([
            orNull(api.activities(a.id, since)),
            a.holdingsAvailable ? orNull(api.positions(a.id)) : null,
            readHistory
              ? orNull(api.balanceHistory(a.id).then((h) => h ?? ("unavailable" as const)))
              : undefined,
          ])
        : [null, null, undefined];
      return {
        id: a.id,
        label: accountLabel({ ...a, institution }),
        institution,
        name: a.name ?? a.rawType,
        lastFour: a.lastFour,
        isPaper: a.isPaper,
        closed: closed(a),
        connected,
        balance: a.balance,
        transactionsThrough: a.transactionsReady ? a.transactionsThrough : null,
        activities,
        positions,
        history,
      };
    }),
  );
  return { accounts: read, listedIds: accounts.map((a) => a.id) };
}

/**
 * Takes the right to sync a person. False when another sync started within
 * `minGapMs`, so a page view and the nightly job never overlap.
 */
async function claimSync(
  userId: string,
  minGapMs: number,
): Promise<Date | null> {
  const db = await getDb();
  const now = new Date();
  const claimed = await db
    .update(t.users)
    .set({ syncClaimedAt: now, lastSyncError: null })
    .where(
      and(
        eq(t.users.id, userId),
        or(
          isNull(t.users.syncClaimedAt),
          lt(t.users.syncClaimedAt, new Date(now.getTime() - minGapMs)),
        ),
      ),
    )
    .returning({ claimedAt: t.users.syncClaimedAt });
  return claimed[0]?.claimedAt ?? null;
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
  const claim = await claimSync(userId, options.minGapMs ?? 60_000);
  if (!claim) return "busy";
  try {
    return await runSync(userId, config);
  } catch (error) {
    // Kept so the person, and whoever debugs it, can see why it stopped.
    // Only this run's claim is written to: a newer sync owns the row now.
    const message = error instanceof Error ? error.message : String(error);
    try {
      await (await getDb())
        .update(t.users)
        .set({ lastSyncError: message.replace(/\s+/g, " ").slice(0, 200) })
        .where(and(eq(t.users.id, userId), eq(t.users.syncClaimedAt, claim)));
    } catch (cause) {
      console.error("could not record the sync error", cause);
    }
    throw error;
  }
}

/**
 * How the latest sync that someone else started ended, if it has, and how
 * long ago it started.
 */
export async function syncOutcome(userId: string): Promise<{
  state: "done" | "failed" | "running" | "none";
  ageMs: number;
}> {
  const [row] = await (await getDb())
    .select({
      claimed: t.users.syncClaimedAt,
      synced: t.users.lastSyncedAt,
      error: t.users.lastSyncError,
    })
    .from(t.users)
    .where(eq(t.users.id, userId));
  if (!row?.claimed) return { state: "none", ageMs: 0 };
  const ageMs = Date.now() - row.claimed.getTime();
  if (row.error) return { state: "failed", ageMs };
  if (row.synced && row.synced.getTime() >= row.claimed.getTime()) {
    return { state: "done", ageMs };
  }
  return { state: "running", ageMs };
}

/**
 * How long a sync someone else started may run before a manual sync takes
 * over. Page-view syncs run as their own request now, but one started in a
 * page's background time is stopped about 30 seconds after the page is sent
 * and records nothing, so one older than this is taken to be gone.
 */
export const BACKGROUND_SYNC_MS = 35_000;

async function runSync(
  userId: string,
  config: SnapTradeConfig,
): Promise<SyncResult> {
  const today = toDateString(new Date());
  const store = tokenStore(userId, config.encryptionKey);

  // Which accounts still lack their history, so only those are asked for it.
  const known = new Map(
    (
      await (await getDb())
        .select({
          id: t.accounts.id,
          historyCheckedOn: t.accounts.historyCheckedOn,
          historyFrom: t.accounts.historyFrom,
        })
        .from(t.accounts)
        .where(eq(t.accounts.userId, userId))
    ).map((a) => [a.id, a]),
  );
  const wantsHistory = (id: string) => needsHistory(known.get(id), today);

  let fetched: FetchedAccount[];
  let listedIds: string[];
  try {
    ({ accounts: fetched, listedIds } = await withAccessToken(
      store,
      (refreshToken) => refreshTokens(config, refreshToken),
      (accessToken) => fetchAll(accessToken, today, wantsHistory),
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
  const [owned, clashing, storedFacts, user, heldBadges, snapshots] =
    await Promise.all([
      db.select().from(t.accounts).where(eq(t.accounts.userId, userId)),
      ids.length === 0
        ? []
        : db
            .select({ id: t.accounts.id })
            .from(t.accounts)
            .where(
              and(inArray(t.accounts.id, ids), ne(t.accounts.userId, userId)),
            ),
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

  // Where each account's own measured days begin. Estimates stop there.
  const firstMeasured: Record<string, string> = {};
  if (mine.some((a) => Array.isArray(a.history))) {
    const rows = await db
      .select({
        accountId: t.dailyReturns.accountId,
        first: sql<string>`min(${t.dailyReturns.date})`,
      })
      .from(t.dailyReturns)
      .where(
        and(
          eq(t.dailyReturns.estimated, false),
          inArray(
            t.dailyReturns.accountId,
            db
              .select({ id: t.accounts.id })
              .from(t.accounts)
              .where(eq(t.accounts.userId, userId)),
          ),
        ),
      )
      .groupBy(t.dailyReturns.accountId);
    for (const r of rows) firstMeasured[r.accountId] = r.first;
  }

  const plan = planSync({
    today,
    firstMeasured,
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
  for (const group of chunks(plan.accounts, 12)) {
    writes.push(
      db
        .insert(t.accounts)
        .values(
          group.map((a) => ({
            id: a.id,
            userId,
            label: a.label,
            institution: a.institution?.slice(0, 60) ?? null,
            name: a.name?.slice(0, 60) ?? null,
            lastFour: a.lastFour,
            positionsCount: a.positionsCount,
            counted: a.countedIfNew,
            connected: a.connected,
            lastSyncedOn: a.lastSyncedOn,
            historyCheckedOn: a.historyCheckedOn,
            historyFrom: a.historyFrom,
          })),
        )
        .onConflictDoUpdate({
          target: t.accounts.id,
          set: {
            label: sql`excluded.label`,
            institution: sql`excluded.institution`,
            name: sql`excluded.name`,
            lastFour: sql`excluded.last_four`,
            // A sync that could not read positions keeps the last count.
            positionsCount: sql`coalesce(excluded.positions_count, ${t.accounts.positionsCount})`,
            connected: sql`excluded.connected`,
            lastSyncedOn: sql`excluded.last_synced_on`,
            historyCheckedOn: sql`excluded.history_checked_on`,
            historyFrom: sql`excluded.history_from`,
          },
          setWhere: eq(t.accounts.userId, userId),
        }),
    );
  }
  if (plan.forgetAccountIds.length > 0) {
    writes.push(
      db
        .delete(t.accounts)
        .where(
          and(
            eq(t.accounts.userId, userId),
            inArray(t.accounts.id, plan.forgetAccountIds.slice(0, 80)),
          ),
        ),
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
  for (const group of chunks(plan.returns, 7)) {
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
            estimated: false,
          })),
        )
        .onConflictDoUpdate({
          target: [t.dailyReturns.accountId, t.dailyReturns.date],
          set: {
            dailyReturn: sql`excluded.daily_return`,
            partial: sql`excluded.partial`,
            weight: sql`excluded.weight`,
            flowRate: sql`excluded.flow_rate`,
            estimated: sql`excluded.estimated`,
          },
        }),
    );
  }
  // A year of estimated days per account goes in as one statement each, as
  // JSON, to stay well inside D1's limits. Only an earlier estimate is ever
  // replaced: a day Holdfast measured keeps its return.
  const backfilled = new Map<string, (string | number | null)[][]>();
  for (const r of plan.backfill) {
    const rows = backfilled.get(r.accountId) ?? [];
    rows.push([r.date, r.dailyReturn, r.partial ? 1 : 0, r.weight ?? null, r.flowRate ?? 0]);
    backfilled.set(r.accountId, rows);
  }
  for (const [accountId, rows] of backfilled) {
    writes.push(
      db.run(sql`
        insert into daily_returns
          (account_id, date, daily_return, partial, weight, flow_rate, estimated)
        select ${accountId}, json_extract(value, '$[0]'), json_extract(value, '$[1]'),
          json_extract(value, '$[2]'), json_extract(value, '$[3]'),
          json_extract(value, '$[4]'), 1
        from json_each(${JSON.stringify(rows)})
        where exists (
          select 1 from accounts a where a.id = ${accountId} and a.user_id = ${userId})
        on conflict (account_id, date) do update set
          daily_return = excluded.daily_return, partial = excluded.partial,
          weight = excluded.weight, flow_rate = excluded.flow_rate
        where daily_returns.estimated = 1`),
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
        lastSyncError: null,
      })
      .where(eq(t.users.id, userId)),
  );
  // One batch: either the whole day is recorded or none of it is.
  await batchStatements(db, writes);
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
