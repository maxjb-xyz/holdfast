import "server-only";
import { and, eq, gt, lt } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthStates, sessions, users } from "@/db/schema";
import { safeReturnTo } from "@/lib/inputs";
import { pkceChallenge, randomToken } from "./crypto";
import type { SnapTradeConfig } from "./env";
import {
  authorizeUrl,
  exchangeCode,
  verifyIdToken,
  type TokenSet,
} from "./snaptrade/oauth";
import { saveTokens } from "./snaptrade/token-store";

/** The cookie that ties a sign-in attempt to the browser that started it. */
export const OAUTH_COOKIE = "hf_oauth";
export const ATTEMPT_MINUTES = 10;

/** Starts a sign-in attempt and returns where to send the browser. */
export async function beginSignIn(
  config: SnapTradeConfig,
  returnTo: string | null,
): Promise<{ url: string; state: string }> {
  const state = randomToken(32);
  const codeVerifier = randomToken(48);
  const nonce = randomToken(24);
  const db = await getDb();
  const now = new Date();
  await db.batch([
    // Housekeeping: attempts and sessions that have run out.
    db.delete(oauthStates).where(lt(oauthStates.expiresAt, now)),
    db.delete(sessions).where(lt(sessions.expiresAt, now)),
    db.insert(oauthStates).values({
      state,
      codeVerifier,
      nonce,
      returnTo,
      expiresAt: new Date(now.getTime() + ATTEMPT_MINUTES * 60_000),
    }),
  ]);
  const url = authorizeUrl(config, {
    state,
    nonce,
    challenge: await pkceChallenge(codeVerifier),
  });
  return { url, state };
}

/**
 * Finishes a sign-in: spends the attempt, trades the code for tokens, checks
 * who signed in, and stores their encrypted tokens. Throws if anything is off.
 */
export async function completeSignIn(
  config: SnapTradeConfig,
  input: { code: string; state: string },
): Promise<{ userId: string; returnTo: string | null }> {
  const db = await getDb();
  // Deleting the row is what spends it, so a state works exactly once.
  const [attempt] = await db
    .delete(oauthStates)
    .where(
      and(
        eq(oauthStates.state, input.state),
        gt(oauthStates.expiresAt, new Date()),
      ),
    )
    .returning();
  if (!attempt) throw new Error("Unknown or expired sign-in attempt");

  const tokens: TokenSet = await exchangeCode(
    config,
    input.code,
    attempt.codeVerifier,
  );
  if (!tokens.idToken) throw new Error("No ID token in the token response");
  if (tokens.scope && tokens.scope.split(/\s+/).includes("trade")) {
    // Holdfast is read-only. A token that can trade is never kept.
    throw new Error("Token carries the trade scope");
  }
  const identity = await verifyIdToken(tokens.idToken, {
    clientId: config.clientId,
    nonce: attempt.nonce,
  });

  const displayName = (identity.name ?? "Investor").slice(0, 40);
  await db
    .insert(users)
    .values({ id: identity.sub, displayName })
    .onConflictDoUpdate({
      target: users.id,
      set: identity.name ? { displayName } : { id: identity.sub },
    });
  await saveTokens(identity.sub, tokens, config.encryptionKey);
  return { userId: identity.sub, returnTo: safeReturnTo(attempt.returnTo) };
}
