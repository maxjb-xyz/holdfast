import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { toDateString } from "@/lib/quarters";
import { getDb } from "@/db";
import { accounts, users } from "@/db/schema";
import { cleanDisplayName } from "@/lib/inputs";

export async function setPrivacy(
  userId: string,
  field: "showReturn" | "showBadges" | "showHoldings",
  on: boolean,
): Promise<void> {
  const db = await getDb();
  await db
    .update(users)
    .set({ [field]: on })
    .where(eq(users.id, userId));
}

/** Only the owner's own account can be changed: the user id is part of the match. */
export async function setAccountCounted(
  userId: string,
  accountId: string,
  on: boolean,
): Promise<void> {
  const db = await getDb();
  const today = toDateString(new Date());
  await db.batch([
    db
      .update(accounts)
      .set({ counted: on })
      .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId))),
    // The pause follows the choice at once: counting a dropped account
    // pauses the rank, and leaving the last dropped one out lifts the pause,
    // as long as the SnapTrade connection itself still works.
    db
      .update(users)
      .set({
        pausedSince: sql`case
          when exists (select 1 from accounts a
            where a.user_id = ${userId} and a.counted = 1 and a.connected = 0)
            then coalesce(${users.pausedSince}, ${today})
          when exists (select 1 from oauth_tokens o
            where o.user_id = ${userId} and o.status <> 'needs_reconnect')
            then null
          else ${users.pausedSince} end`,
      })
      .where(eq(users.id, userId)),
  ]);
}

/** Changes the name friends see. Returns false when nothing usable was given. */
export async function setDisplayName(
  userId: string,
  rawName: string,
): Promise<boolean> {
  const displayName = cleanDisplayName(rawName);
  if (!displayName) return false;
  const db = await getDb();
  await db.update(users).set({ displayName }).where(eq(users.id, userId));
  return true;
}
