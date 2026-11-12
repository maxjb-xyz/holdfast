import "server-only";
import { cookies } from "next/headers";
import { eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { accounts, leagueMembers, userFacts } from "@/db/schema";
import { DEMO_VIEWER_ID, demoLeague } from "@/lib/demo";
import type { AccountView } from "@/lib/full-pages";
import { readDemoPrefs } from "./leagues";
import { today, WELCOME_COOKIE, type Viewer } from "./viewer";

/**
 * The viewer's linked accounts, for the pages where they choose what counts.
 * Brokerage, name, number and position count are filled in when the sync has
 * stored them; otherwise only the label is known.
 */
export async function myAccounts(viewer: Viewer): Promise<AccountView[]> {
  if (viewer.kind === "demo") {
    const prefs = await readDemoPrefs();
    const me = demoLeague(today()).members.find(
      (m) => m.userId === DEMO_VIEWER_ID,
    );
    return (me?.accounts ?? []).map((a) => ({
      ...a,
      counted: Array.isArray(prefs.off) ? !prefs.off.includes(a.id) : a.counted,
    }));
  }
  const db = await getDb();
  const rows: Record<string, unknown>[] = await db
    .select()
    .from(accounts)
    .where(eq(accounts.userId, viewer.id))
    .orderBy(accounts.label);
  const text = (v: unknown) => (typeof v === "string" && v.trim() ? v : null);
  return rows.map((row) => ({
    id: String(row.id),
    label: String(row.label),
    counted: Boolean(row.counted),
    connected: Boolean(row.connected),
    institution: text(row.institution),
    name: text(row.name),
    lastFour: text(row.lastFour),
    positions:
      typeof row.positionsCount === "number" ? row.positionsCount : null,
  }));
}

/** The day each current holding was first seen, by ticker. */
export async function myFirstSeen(
  viewer: Viewer,
): Promise<Record<string, string>> {
  if (viewer.kind === "demo") return {};
  const db = await getDb();
  const [row] = await db
    .select({ firstSeen: userFacts.firstSeen })
    .from(userFacts)
    .where(eq(userFacts.userId, viewer.id));
  return row?.firstSeen ?? {};
}

/**
 * Whether a signed-in person should be taken through the first run: they are
 * in no league yet and have not chosen to skip it.
 */
export async function needsWelcome(viewer: Viewer): Promise<boolean> {
  if (viewer.kind !== "user") return false;
  if ((await cookies()).get(WELCOME_COOKIE)?.value === "1") return false;
  const db = await getDb();
  const [row] = await db
    .select({ n: sql<number>`count(*)` })
    .from(leagueMembers)
    .where(eq(leagueMembers.userId, viewer.id));
  return (row?.n ?? 0) === 0;
}

/** The site's own address, for building invite links. */
export async function siteOrigin(): Promise<string> {
  const { appUrl } = await import("./env");
  const configured = await appUrl();
  if (configured) return configured.replace(/\/$/, "");
  const { headers } = await import("next/headers");
  const host = (await headers()).get("host") ?? "localhost";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}
