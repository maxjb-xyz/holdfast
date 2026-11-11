import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { snaptradeConfig } from "./env";
import type { SessionUser } from "./session";
import { syncUser } from "./sync";

const STALE_MS = 60 * 60_000;

/**
 * Starts a sync in the background when a signed-in person opens the app and
 * their numbers are more than an hour old. The page does not wait for it.
 */
export async function syncIfStale(user: SessionUser): Promise<void> {
  const last = user.lastSyncedAt?.getTime() ?? 0;
  const claimed = user.syncClaimedAt?.getTime() ?? 0;
  const now = Date.now();
  if (now - last < STALE_MS || now - claimed < STALE_MS / 4) return;
  try {
    const config = await snaptradeConfig();
    if (!config) return;
    const { ctx } = await getCloudflareContext({ async: true });
    ctx.waitUntil(
      syncUser(user.id, config, { minGapMs: STALE_MS / 4 }).catch((error) =>
        console.error("background sync failed", error),
      ),
    );
  } catch (error) {
    console.error("could not start background sync", error);
  }
}
