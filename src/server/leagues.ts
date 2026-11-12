import "server-only";
import { and, eq, gte, inArray } from "drizzle-orm";
import { cookies } from "next/headers";
import { getDb } from "@/db";
import {
  accounts,
  badges,
  dailyReturns,
  leagueMembers,
  leagues,
  quarterSnapshots,
  userFacts,
  users,
} from "@/db/schema";
import { EMPTY_FACTS, type BadgeKey, type HabitFacts } from "@/lib/badges";
import { DEMO_LEAGUE_ID, DEMO_VIEWER_ID, demoLeague } from "@/lib/demo";
import {
  DEFAULT_PRIVACY,
  type League,
  type Player,
  type Privacy,
} from "@/lib/model";
import { quarterOf, quartersEndingAt, toDateString } from "@/lib/quarters";
import { combineAccounts, type DailyReturnRow } from "@/lib/scoring";
import { today, type Viewer } from "./viewer";

export const DEMO_PREFS_COOKIE = "hf_demo_prefs";

export type DemoPrefs = Partial<Privacy> & { off?: string[] };

export async function readDemoPrefs(): Promise<DemoPrefs> {
  try {
    const raw = (await cookies()).get(DEMO_PREFS_COOKIE)?.value;
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === "object" ? (parsed as DemoPrefs) : {};
  } catch {
    return {};
  }
}

/** The demo league for a visitor, with any switches they flipped applied. */
async function demoLeagueForVisitor(day: string): Promise<League> {
  const prefs = await readDemoPrefs();
  const league = demoLeague(day);
  return {
    ...league,
    members: league.members.map((m) =>
      m.userId !== DEMO_VIEWER_ID
        ? m
        : {
            ...m,
            privacy: {
              showReturn: prefs.showReturn ?? DEFAULT_PRIVACY.showReturn,
              showBadges: prefs.showBadges ?? DEFAULT_PRIVACY.showBadges,
              showHoldings: prefs.showHoldings ?? DEFAULT_PRIVACY.showHoldings,
            },
            accounts: m.accounts.map((a) => ({
              ...a,
              counted: Array.isArray(prefs.off)
                ? !prefs.off.includes(a.id)
                : a.counted,
            })),
          },
    ),
  };
}

/** How far back daily rows are loaded: this quarter and the three before it. */
function historyStart(day: string): string {
  return quartersEndingAt(quarterOf(day), 4)[0].start;
}

/** Loads people from the database as players. `joinedOn` comes from the league. */
async function loadPlayers(
  joined: ReadonlyMap<string, string>,
  day: string,
): Promise<Player[]> {
  const ids = [...joined.keys()];
  if (ids.length === 0) return [];
  const db = await getDb();
  const [people, accountRows, factRows, snapshotRows, badgeRows] =
    await Promise.all([
      db.select().from(users).where(inArray(users.id, ids)),
      db.select().from(accounts).where(inArray(accounts.userId, ids)),
      db.select().from(userFacts).where(inArray(userFacts.userId, ids)),
      db
        .select()
        .from(quarterSnapshots)
        .where(inArray(quarterSnapshots.userId, ids)),
      db.select().from(badges).where(inArray(badges.userId, ids)),
    ]);
  // Matched through a subquery so the statement stays small however many
  // accounts the members have between them.
  const returnRows = await db
    .select()
    .from(dailyReturns)
    .where(
      and(
        inArray(
          dailyReturns.accountId,
          db
            .select({ id: accounts.id })
            .from(accounts)
            .where(and(inArray(accounts.userId, ids), eq(accounts.counted, true))),
        ),
        gte(dailyReturns.date, historyStart(day)),
      ),
    );

  return people.map((person) => {
    const mine = accountRows.filter((a) => a.userId === person.id);
    const perAccount = mine
      .filter((a) => a.counted)
      .map((a) =>
        returnRows
          .filter((r) => r.accountId === a.id)
          .map<DailyReturnRow>((r) => ({
            date: r.date,
            dailyReturn: r.dailyReturn,
            partial: r.partial,
            weight: r.weight,
            flowRate: r.flowRate,
            estimated: r.estimated,
          })),
      );
    const rows = combineAccounts(perAccount).filter((r) => r.date <= day);
    const snapshots: Record<string, HabitFacts> = {};
    for (const s of snapshotRows.filter((s) => s.userId === person.id)) {
      snapshots[s.quarter] = s.facts;
    }
    const created = toDateString(person.createdAt);
    // Backfilled history can reach back before the person signed up.
    const firstRow = rows[0]?.date;
    const since = firstRow && firstRow < created ? firstRow : created;
    return {
      userId: person.id,
      name: person.displayName,
      joinedOn: joined.get(person.id) ?? created,
      rows,
      pausedSince: person.pausedSince ?? undefined,
      since,
      facts: factRows.find((f) => f.userId === person.id)?.facts ?? EMPTY_FACTS,
      snapshots,
      earned: badgeRows
        .filter((b) => b.userId === person.id)
        .map((b) => ({
          key: b.badgeKey as BadgeKey,
          quarter: b.quarter,
          on: b.earnedOn,
        })),
      privacy: {
        showReturn: person.showReturn,
        showBadges: person.showBadges,
        showHoldings: person.showHoldings,
      },
      accounts: mine.map((a) => ({
        id: a.id,
        label: a.label,
        counted: a.counted,
        connected: a.connected,
      })),
    };
  });
}

export type LeagueSummary = { id: string; name: string; isDemo: boolean };

/** Every league the viewer can open. The demo league is always last. */
export async function listLeagues(viewer: Viewer): Promise<LeagueSummary[]> {
  const demo = {
    id: DEMO_LEAGUE_ID,
    name: demoLeague(today()).name,
    isDemo: true,
  };
  if (viewer.kind === "demo") return [demo];
  const db = await getDb();
  const mine = await db
    .select({ id: leagues.id, name: leagues.name })
    .from(leagueMembers)
    .innerJoin(leagues, eq(leagues.id, leagueMembers.leagueId))
    .where(eq(leagueMembers.userId, viewer.id))
    .orderBy(leagueMembers.joinedOn);
  return [...mine.map((l) => ({ ...l, isDemo: false })), demo];
}

/**
 * Loads a league for the viewer. Without an id it opens their first real
 * league, or the demo league if they have none. Returns null when the league
 * does not exist or the viewer is not a member.
 */
export async function loadLeague(
  viewer: Viewer,
  leagueId?: string,
): Promise<League | null> {
  const day = today();
  if (viewer.kind === "demo") {
    return !leagueId || leagueId === DEMO_LEAGUE_ID
      ? demoLeagueForVisitor(day)
      : null;
  }
  const db = await getDb();
  let id = leagueId;
  if (!id) {
    const [first] = await db
      .select({ id: leagueMembers.leagueId })
      .from(leagueMembers)
      .where(eq(leagueMembers.userId, viewer.id))
      .orderBy(leagueMembers.joinedOn)
      .limit(1);
    id = first?.id ?? DEMO_LEAGUE_ID;
  }
  if (id === DEMO_LEAGUE_ID) {
    const [me] = await loadPlayers(new Map([[viewer.id, day]]), day);
    if (!me) return null;
    // In the demo league a real person is scored from the day they signed up.
    return demoLeague(day, {
      ...me,
      joinedOn: me.since < day ? me.since : day,
    });
  }
  const [league] = await db.select().from(leagues).where(eq(leagues.id, id));
  if (!league) return null;
  const members = await db
    .select()
    .from(leagueMembers)
    .where(eq(leagueMembers.leagueId, id));
  if (!members.some((m) => m.userId === viewer.id)) return null;
  const players = await loadPlayers(
    new Map(members.map((m) => [m.userId, m.joinedOn])),
    day,
  );
  return {
    id: league.id,
    name: league.name,
    isDemo: false,
    inviteCode: league.inviteCode,
    ownerId: league.ownerId,
    createdOn: league.createdOn,
    startOn: league.startOn ?? undefined,
    members: players,
  };
}
