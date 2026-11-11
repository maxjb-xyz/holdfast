import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, users } from "@/db/schema";

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
  await db
    .update(accounts)
    .set({ counted: on })
    .where(and(eq(accounts.id, accountId), eq(accounts.userId, userId)));
}
