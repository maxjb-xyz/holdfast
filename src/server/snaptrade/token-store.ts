import "server-only";
import { and, eq, lt, or, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthTokens, users } from "@/db/schema";
import { toDateString } from "@/lib/quarters";
import { seal, unseal } from "../crypto";
import type { StoredTokens, TokenStore } from "./access";
import type { TokenSet } from "./oauth";

/** A refresh that has been in flight this long is taken to have died. */
const STALE_CLAIM_MS = 60_000;

/** Encrypts and saves a token pair for a person, replacing any they had. */
export async function saveTokens(
  userId: string,
  tokens: TokenSet,
  key: string,
): Promise<void> {
  const db = await getDb();
  const now = new Date();
  const values = {
    accessTokenEnc: await seal(tokens.accessToken, key, userId),
    refreshTokenEnc: await seal(tokens.refreshToken, key, userId),
    accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
    scope: tokens.scope,
    status: "active",
    updatedAt: now,
  };
  await db
    .insert(oauthTokens)
    .values({ userId, ...values })
    .onConflictDoUpdate({ target: oauthTokens.userId, set: values });
}

/**
 * Marks a person as needing to sign in again and pauses their rank from the
 * last day that synced. A pause that is already in place keeps its date.
 */
export async function pauseForReconnect(userId: string): Promise<void> {
  const db = await getDb();
  const [user] = await db
    .select({ lastSyncedAt: users.lastSyncedAt })
    .from(users)
    .where(eq(users.id, userId));
  const since = toDateString(user?.lastSyncedAt ?? new Date());
  await db.batch([
    db
      .update(oauthTokens)
      .set({ status: "needs_reconnect", updatedAt: new Date() })
      .where(eq(oauthTokens.userId, userId)),
    db
      .update(users)
      .set({ pausedSince: sql`coalesce(${users.pausedSince}, ${since})` })
      .where(eq(users.id, userId)),
  ]);
}

/** The database-backed token store for one person. Tokens are encrypted at rest. */
export function tokenStore(userId: string, key: string): TokenStore {
  // The stored ciphertext for each refresh token seen, so a claim can check
  // that the row still holds the token this request is about to spend.
  const sealedRefresh = new Map<string, string>();

  return {
    async load(): Promise<StoredTokens | null> {
      const db = await getDb();
      const [row] = await db
        .select()
        .from(oauthTokens)
        .where(eq(oauthTokens.userId, userId));
      if (!row) return null;
      const refreshToken = await unseal(row.refreshTokenEnc, key, userId);
      sealedRefresh.set(refreshToken, row.refreshTokenEnc);
      return {
        accessToken: await unseal(row.accessTokenEnc, key, userId),
        refreshToken,
        accessExpiresAt: row.accessExpiresAt.getTime(),
        status: row.status,
      };
    },

    async claimRefresh(current: StoredTokens): Promise<boolean> {
      const sealed = sealedRefresh.get(current.refreshToken);
      if (!sealed) return false;
      const db = await getDb();
      const now = new Date();
      const claimed = await db
        .update(oauthTokens)
        .set({ status: "refreshing", updatedAt: now })
        .where(
          and(
            eq(oauthTokens.userId, userId),
            eq(oauthTokens.refreshTokenEnc, sealed),
            or(
              eq(oauthTokens.status, "active"),
              and(
                eq(oauthTokens.status, "refreshing"),
                lt(
                  oauthTokens.updatedAt,
                  new Date(now.getTime() - STALE_CLAIM_MS),
                ),
              ),
            ),
          ),
        )
        .returning({ userId: oauthTokens.userId });
      return claimed.length === 1;
    },

    async save(tokens: TokenSet): Promise<void> {
      const db = await getDb();
      const now = new Date();
      const refreshTokenEnc = await seal(tokens.refreshToken, key, userId);
      await db
        .update(oauthTokens)
        .set({
          accessTokenEnc: await seal(tokens.accessToken, key, userId),
          refreshTokenEnc,
          accessExpiresAt: new Date(now.getTime() + tokens.expiresIn * 1000),
          ...(tokens.scope ? { scope: tokens.scope } : {}),
          status: "active",
          updatedAt: now,
        })
        .where(eq(oauthTokens.userId, userId));
      sealedRefresh.set(tokens.refreshToken, refreshTokenEnc);
    },

    async release(): Promise<void> {
      const db = await getDb();
      await db
        .update(oauthTokens)
        .set({ status: "active", updatedAt: new Date() })
        .where(
          and(
            eq(oauthTokens.userId, userId),
            eq(oauthTokens.status, "refreshing"),
          ),
        );
    },

    markReconnect: () => pauseForReconnect(userId),
  };
}
