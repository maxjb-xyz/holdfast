import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts } from "@/db/schema";
import { snaptradeConfig } from "./env";
import type { SessionUser } from "./session";
import { syncUser } from "./sync";

const STALE_MS = 60 * 60_000;
/** How soon an account stored without its details is tried again. */
const DETAILS_RETRY_MS = 5 * 60_000;
/**
 * When the sync started storing each account's brokerage, name and number.
 * Only people last synced before this can have rows missing all three for
 * that reason; for anyone synced since, a blank row is what SnapTrade sent
 * (or an account it no longer lists), and re-syncing would not change it.
 */
const DETAILS_SINCE = Date.parse("2026-11-12T17:57:00Z");

/**
 * Whether the person has an account stored before the sync kept its details
 * (brokerage, name, number). Those rows only carry the bare "Account" label
 * until a sync rewrites them, so they should not wait out the hour.
 */
async function missingDetails(userId: string): Promise<boolean> {
  const db = await getDb();
  const rows = await db
    .select({ id: accounts.id })
    .from(accounts)
    .where(
      and(
        eq(accounts.userId, userId),
        eq(accounts.connected, true),
        isNull(accounts.institution),
        isNull(accounts.name),
        isNull(accounts.lastFour),
      ),
    )
    .limit(1);
  return rows.length > 0;
}

/**
 * Starts a sync in the background when a signed-in person opens the app and
 * their numbers are more than an hour old, or when some of their accounts
 * were stored without details and so still read "Account". The page does
 * not wait for it. Layouts render alongside pages, so waiting here would not
 * change what this page shows anyway; the next one shows the fresh data.
 */
export async function syncIfStale(user: SessionUser): Promise<void> {
  const last = user.lastSyncedAt?.getTime() ?? 0;
  const claimed = user.syncClaimedAt?.getTime() ?? 0;
  const now = Date.now();
  if (now - claimed < DETAILS_RETRY_MS) return;
  try {
    const stale = now - last >= STALE_MS && now - claimed >= STALE_MS / 4;
    const repair =
      !stale &&
      last < DETAILS_SINCE &&
      !user.pausedSince &&
      (await missingDetails(user.id));
    if (!stale && !repair) return;
    const config = await snaptradeConfig();
    if (!config) return;
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(
      syncUser(user.id, config, {
        minGapMs: stale ? STALE_MS / 4 : DETAILS_RETRY_MS,
      }).catch((error) => console.error("background sync failed", error)),
    );
  } catch (error) {
    console.error("could not start background sync", error);
  }
}
