import "server-only";
import { and, eq, inArray, sql } from "drizzle-orm";
import { getDb } from "@/db";
import * as t from "@/db/schema";
import { cleanLeagueName } from "@/lib/inputs";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { toDateString } from "@/lib/quarters";
import { randomToken, unseal } from "./crypto";
import type { SnapTradeConfig } from "./env";
import { revokeToken } from "./snaptrade/oauth";
import { pauseForReconnect } from "./snaptrade/token-store";

export const MAX_LEAGUES_PER_PERSON = 6;

const today = () => toDateString(new Date());

async function leagueCount(userId: string): Promise<number> {
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(t.leagueMembers)
    .where(eq(t.leagueMembers.userId, userId));
  return row?.n ?? 0;
}

export type LeagueOutcome =
  | { ok: true; leagueId: string }
  | { ok: false; reason: "name" | "too-many" | "not-found" | "full" };

/** Makes a league with the person as its owner and first member. */
export async function createLeague(
  userId: string,
  rawName: string,
): Promise<LeagueOutcome> {
  const name = cleanLeagueName(rawName);
  if (!name) return { ok: false, reason: "name" };
  if ((await leagueCount(userId)) >= MAX_LEAGUES_PER_PERSON) {
    return { ok: false, reason: "too-many" };
  }
  const db = await getDb();
  const id = randomToken(9);
  const day = today();
  await db.batch([
    db.insert(t.leagues).values({
      id,
      name,
      inviteCode: randomToken(12),
      ownerId: userId,
      createdOn: day,
    }),
    db.insert(t.leagueMembers).values({ leagueId: id, userId, joinedOn: day }),
  ]);
  return { ok: true, leagueId: id };
}

export type InvitePreview = {
  leagueId: string;
  name: string;
  members: number;
  alreadyIn: boolean;
};

/** What an invite link leads to. Shows only the league's name and size. */
export async function previewInvite(
  code: string,
  userId: string | null,
): Promise<InvitePreview | null> {
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(code)) return null;
  const db = await getDb();
  const [league] = await db
    .select({ id: t.leagues.id, name: t.leagues.name })
    .from(t.leagues)
    .where(eq(t.leagues.inviteCode, code));
  if (!league) return null;
  const members = await db
    .select({ userId: t.leagueMembers.userId })
    .from(t.leagueMembers)
    .where(eq(t.leagueMembers.leagueId, league.id));
  return {
    leagueId: league.id,
    name: league.name,
    members: members.length,
    alreadyIn: userId !== null && members.some((m) => m.userId === userId),
  };
}

/** Joins the league behind an invite code. Late joiners are scored from today. */
export async function joinLeague(
  userId: string,
  code: string,
): Promise<LeagueOutcome> {
  const invite = await previewInvite(code, userId);
  if (!invite) return { ok: false, reason: "not-found" };
  if (invite.alreadyIn) return { ok: true, leagueId: invite.leagueId };
  if ((await leagueCount(userId)) >= MAX_LEAGUES_PER_PERSON) {
    return { ok: false, reason: "too-many" };
  }
  const db = await getDb();
  // The size check and the insert are one statement, so two people racing
  // for the last place cannot both get in.
  await db.run(sql`
    insert into league_members (league_id, user_id, joined_on)
    select ${invite.leagueId}, ${userId}, ${today()}
    where (select count(*) from league_members where league_id = ${invite.leagueId}) < ${MAX_LEAGUE_MEMBERS}
    on conflict do nothing`);
  const [joined] = await db
    .select({ userId: t.leagueMembers.userId })
    .from(t.leagueMembers)
    .where(
      and(
        eq(t.leagueMembers.leagueId, invite.leagueId),
        eq(t.leagueMembers.userId, userId),
      ),
    );
  return joined
    ? { ok: true, leagueId: invite.leagueId }
    : { ok: false, reason: "full" };
}

/**
 * Hands each league the person owns to its longest-standing other member,
 * and removes leagues nobody else is in. Run after their membership is gone.
 */
async function settleLeagues(leagueIds: readonly string[]): Promise<void> {
  if (leagueIds.length === 0) return;
  const db = await getDb();
  const mine = inArray(t.leagues.id, [...leagueIds]);
  await db.batch([
    db.delete(t.leagues).where(
      and(
        mine,
        sql`not exists (select 1 from league_members m where m.league_id = leagues.id)`,
      ),
    ),
    db
      .update(t.leagues)
      .set({
        ownerId: sql`(
          select m.user_id from league_members m
          where m.league_id = leagues.id
          order by m.joined_on, m.user_id limit 1)`,
      })
      .where(
        and(
          mine,
          sql`(owner_id is null or not exists (
            select 1 from league_members m
            where m.league_id = leagues.id and m.user_id = leagues.owner_id))`,
        ),
      ),
  ]);
}

/** Leaves one league. The person's own scores and badges are kept. */
export async function leaveLeague(
  userId: string,
  leagueId: string,
): Promise<void> {
  const db = await getDb();
  await db
    .delete(t.leagueMembers)
    .where(
      and(
        eq(t.leagueMembers.leagueId, leagueId),
        eq(t.leagueMembers.userId, userId),
      ),
    );
  await settleLeagues([leagueId]);
}

/** Tells SnapTrade to cancel Holdfast's access. True when it confirmed. */
async function revokeAccess(
  userId: string,
  config: SnapTradeConfig | null,
): Promise<boolean> {
  if (!config) return false;
  const db = await getDb();
  const [row] = await db
    .select()
    .from(t.oauthTokens)
    .where(eq(t.oauthTokens.userId, userId));
  if (!row) return true;
  try {
    const refreshToken = await unseal(
      row.refreshTokenEnc,
      config.encryptionKey,
      userId,
    );
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        if (await revokeToken(config, refreshToken)) return true;
      } catch (error) {
        console.error("revoke attempt failed", error);
      }
    }
    return false;
  } catch (error) {
    console.error("revoke failed", error);
    return false;
  }
}

/**
 * Disconnects SnapTrade but keeps the account: access is revoked, the stored
 * tokens are deleted, and the person's rank pauses until they sign in again.
 */
export async function disconnect(
  userId: string,
  config: SnapTradeConfig | null,
): Promise<boolean> {
  const revoked = await revokeAccess(userId, config);
  await pauseForReconnect(userId);
  const db = await getDb();
  await db.delete(t.oauthTokens).where(eq(t.oauthTokens.userId, userId));
  return revoked;
}

/**
 * Deletes everything Holdfast holds about a person, in one step: SnapTrade
 * access, tokens, sessions, accounts, balances, returns, habits, badges and
 * league memberships. Returns whether SnapTrade confirmed the revocation.
 */
export async function deleteEverything(
  userId: string,
  config: SnapTradeConfig | null,
): Promise<boolean> {
  const revoked = await revokeAccess(userId, config);
  const db = await getDb();
  const memberships = await db
    .select({ leagueId: t.leagueMembers.leagueId })
    .from(t.leagueMembers)
    .where(eq(t.leagueMembers.userId, userId));
  const owned = await db
    .select({ id: t.leagues.id })
    .from(t.leagues)
    .where(eq(t.leagues.ownerId, userId));
  const accountIds = db
    .select({ id: t.accounts.id })
    .from(t.accounts)
    .where(eq(t.accounts.userId, userId));
  // Every table is cleared by name, so nothing depends on cascades.
  await db.batch([
    db
      .delete(t.balanceSnapshots)
      .where(inArray(t.balanceSnapshots.accountId, accountIds)),
    db
      .delete(t.dailyReturns)
      .where(inArray(t.dailyReturns.accountId, accountIds)),
    db.delete(t.accounts).where(eq(t.accounts.userId, userId)),
    db.delete(t.userFacts).where(eq(t.userFacts.userId, userId)),
    db.delete(t.quarterSnapshots).where(eq(t.quarterSnapshots.userId, userId)),
    db.delete(t.badges).where(eq(t.badges.userId, userId)),
    db.delete(t.leagueMembers).where(eq(t.leagueMembers.userId, userId)),
    db.delete(t.oauthTokens).where(eq(t.oauthTokens.userId, userId)),
    db.delete(t.sessions).where(eq(t.sessions.userId, userId)),
    db
      .update(t.leagues)
      .set({ ownerId: null })
      .where(eq(t.leagues.ownerId, userId)),
    db.delete(t.users).where(eq(t.users.id, userId)),
  ]);
  await settleLeagues([
    ...new Set([...memberships.map((m) => m.leagueId), ...owned.map((o) => o.id)]),
  ]);
  return revoked;
}

export type MyLeague = {
  id: string;
  name: string;
  inviteCode: string;
  isOwner: boolean;
  members: number;
  joinedOn: string;
};

/** The leagues a person is in, oldest membership first. */
export async function myLeagues(userId: string): Promise<MyLeague[]> {
  const db = await getDb();
  const rows = await db
    .select({
      id: t.leagues.id,
      name: t.leagues.name,
      inviteCode: t.leagues.inviteCode,
      ownerId: t.leagues.ownerId,
      joinedOn: t.leagueMembers.joinedOn,
      members: sql<number>`(select count(*) from league_members m where m.league_id = ${t.leagues.id})`,
    })
    .from(t.leagueMembers)
    .innerJoin(t.leagues, eq(t.leagues.id, t.leagueMembers.leagueId))
    .where(eq(t.leagueMembers.userId, userId))
    .orderBy(t.leagueMembers.joinedOn);
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    inviteCode: r.inviteCode,
    isOwner: r.ownerId === userId,
    members: r.members,
    joinedOn: r.joinedOn,
  }));
}

