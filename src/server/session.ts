import "server-only";
import { and, eq, gt } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { getDb } from "@/db";
import { sessions, users } from "@/db/schema";
import { randomToken, sha256Hex } from "./crypto";

export const SESSION_COOKIE = "hf_session";
const SESSION_DAYS = 30;

export type SessionUser = typeof users.$inferSelect;

/**
 * The signed-in user for this request, or null. The cookie carries a random
 * token and the database stores only its hash, so a leaked database row
 * cannot be turned back into a working cookie.
 */
export const currentUser = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  try {
    const db = await getDb();
    const [row] = await db
      .select({ user: users })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .where(
        and(
          eq(sessions.id, await sha256Hex(token)),
          gt(sessions.expiresAt, new Date()),
        ),
      )
      .limit(1);
    return row?.user ?? null;
  } catch (error) {
    console.error("session lookup failed", error);
    return null;
  }
});

export async function startSession(userId: string): Promise<void> {
  const token = randomToken(32);
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  const db = await getDb();
  await db
    .insert(sessions)
    .values({ id: await sha256Hex(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) {
    const db = await getDb();
    await db.delete(sessions).where(eq(sessions.id, await sha256Hex(token)));
  }
  jar.delete(SESSION_COOKIE);
}
