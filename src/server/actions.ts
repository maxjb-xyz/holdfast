"use server";

import { cookies } from "next/headers";
import { inviteCodeFrom, safeReturnTo } from "@/lib/inputs";
import { redirect } from "next/navigation";
import { DEMO_PREFS_COOKIE, readDemoPrefs } from "./leagues";
import { endSession } from "./session";
import { DEMO_COOKIE, WELCOME_COOKIE, getViewer } from "./viewer";

/** Opens the demo league for a visitor who has not signed in. */
export async function startDemo(): Promise<void> {
  (await cookies()).set(DEMO_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  redirect("/league");
}

/** Leaves the demo, or signs out, and returns to the front page. */
export async function leave(): Promise<void> {
  const jar = await cookies();
  jar.delete(DEMO_COOKIE);
  jar.delete(DEMO_PREFS_COOKIE);
  await endSession();
  redirect("/");
}

/** Where a form asked to land afterwards, if that is a page of this app. */
function backTo(formData: FormData, fallback: string): string {
  return safeReturnTo(String(formData.get("back") ?? "")) ?? fallback;
}

const PRIVACY_FIELDS = ["showReturn", "showBadges", "showHoldings"] as const;
type PrivacyField = (typeof PRIVACY_FIELDS)[number];

/** Flips one "Friends can see" switch. */
export async function togglePrivacy(formData: FormData): Promise<void> {
  const field = String(formData.get("field")) as PrivacyField;
  const on = formData.get("on") === "true";
  if (!PRIVACY_FIELDS.includes(field)) return;
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (viewer.kind === "demo") {
    const prefs = await readDemoPrefs();
    await saveDemoPrefs({ ...prefs, [field]: on });
  } else {
    const { setPrivacy } = await import("./account");
    await setPrivacy(viewer.id, field, on);
  }
  redirect(backTo(formData, "/profile"));
}

/** Flips whether one linked account counts toward league scores. */
export async function toggleAccount(formData: FormData): Promise<void> {
  const accountId = String(formData.get("accountId"));
  const on = formData.get("on") === "true";
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (viewer.kind === "demo") {
    const prefs = await readDemoPrefs();
    const off = new Set(prefs.off ?? ["demo-a3"]);
    if (on) off.delete(accountId);
    else off.add(accountId);
    await saveDemoPrefs({ ...prefs, off: [...off].slice(0, 10) });
  } else {
    const { setAccountCounted } = await import("./account");
    await setAccountCounted(viewer.id, accountId, on);
  }
  redirect(backTo(formData, "/profile"));
}

async function saveDemoPrefs(prefs: object): Promise<void> {
  (await cookies()).set(DEMO_PREFS_COOKIE, JSON.stringify(prefs), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
}

/** Makes a league and lands on the leagues page with its invite link. */
export async function createLeagueAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  if (viewer.kind !== "user") redirect("/leagues/new");
  const { createLeague } = await import("./league-admin");
  const made = await createLeague(
    viewer.id,
    String(formData.get("name") ?? ""),
  );
  redirect(
    made.ok
      ? `/leagues/${made.leagueId}?notice=created`
      : `${backTo(formData, "/leagues/new")}?notice=${made.reason}`,
  );
}

/** Opens the invite page for a pasted code or link. */
export async function openInviteAction(formData: FormData): Promise<void> {
  const code = inviteCodeFrom(String(formData.get("code") ?? ""));
  redirect(
    code ? `/join/${code}` : `${backTo(formData, "/leagues")}?notice=not-found`,
  );
}

export async function joinLeagueAction(formData: FormData): Promise<void> {
  const code = String(formData.get("code") ?? "");
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/");
  const { joinLeague } = await import("./league-admin");
  const joined = await joinLeague(viewer.id, code);
  if (joined.ok) redirect(`/league?league=${joined.leagueId}`);
  redirect(
    joined.reason === "not-found"
      ? "/leagues?notice=not-found"
      : `/join/${encodeURIComponent(code)}?notice=${joined.reason}`,
  );
}

export async function leaveLeagueAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/");
  const { leaveLeague } = await import("./league-admin");
  await leaveLeague(viewer.id, String(formData.get("leagueId") ?? ""));
  redirect("/leagues?notice=left");
}

/** Revokes SnapTrade access but keeps the account and its history. */
export async function disconnectAction(): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/");
  const { disconnect } = await import("./league-admin");
  const { snaptradeConfig } = await import("./env");
  const revoked = await disconnect(viewer.id, await snaptradeConfig());
  redirect(
    `/settings?notice=${revoked ? "disconnected" : "disconnected-check"}`,
  );
}

/** Deletes everything about the person in one step and signs them out. */
export async function deleteEverythingAction(): Promise<void> {
  const viewer = await getViewer();
  if (!viewer) redirect("/");
  const jar = await cookies();
  let revoked = true;
  if (viewer.kind === "user") {
    const { deleteEverything } = await import("./league-admin");
    const { snaptradeConfig } = await import("./env");
    const { SESSION_COOKIE } = await import("./session");
    revoked = await deleteEverything(viewer.id, await snaptradeConfig());
    jar.delete(SESSION_COOKIE);
  }
  jar.delete(DEMO_COOKIE);
  jar.delete(DEMO_PREFS_COOKIE);
  redirect(revoked ? "/?notice=deleted" : "/?notice=deleted-check");
}

// ------------------------------------------------------------ managing

/** Runs one owner action on a league and lands back on its manage page. */
async function manage(
  formData: FormData,
  done: string,
  run: (
    admin: typeof import("./league-admin"),
    userId: string,
    leagueId: string,
  ) => Promise<{ ok: true } | { ok: false; reason: string }>,
): Promise<never> {
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/");
  const leagueId = String(formData.get("leagueId") ?? "");
  const outcome = await run(
    await import("./league-admin"),
    viewer.id,
    leagueId,
  );
  const page = `/leagues/${encodeURIComponent(leagueId)}`;
  redirect(`${page}?notice=${outcome.ok ? done : outcome.reason}`);
}

export async function renameLeagueAction(formData: FormData): Promise<void> {
  await manage(formData, "renamed", (admin, userId, leagueId) =>
    admin.renameLeague(userId, leagueId, String(formData.get("name") ?? "")),
  );
}

export async function resetInviteAction(formData: FormData): Promise<void> {
  await manage(formData, "reset", (admin, userId, leagueId) =>
    admin.resetInviteCode(userId, leagueId),
  );
}

export async function removeMemberAction(formData: FormData): Promise<void> {
  await manage(formData, "removed", (admin, userId, leagueId) =>
    admin.removeMember(userId, leagueId, String(formData.get("userId") ?? "")),
  );
}

export async function transferLeagueAction(formData: FormData): Promise<void> {
  await manage(formData, "handed-over", (admin, userId, leagueId) =>
    admin.transferOwnership(
      userId,
      leagueId,
      String(formData.get("userId") ?? ""),
    ),
  );
}

export async function deleteLeagueAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/");
  const leagueId = String(formData.get("leagueId") ?? "");
  const { deleteLeague } = await import("./league-admin");
  const outcome = await deleteLeague(viewer.id, leagueId);
  redirect(
    outcome.ok
      ? "/leagues?notice=deleted"
      : `/leagues/${encodeURIComponent(leagueId)}?notice=${outcome.reason}`,
  );
}

/** Changes the name friends see. */
export async function renameSelfAction(formData: FormData): Promise<void> {
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect("/settings");
  const { setDisplayName } = await import("./account");
  const ok = await setDisplayName(
    viewer.id,
    String(formData.get("name") ?? ""),
  );
  redirect(`/settings?notice=${ok ? "renamed" : "name"}`);
}

/** Pulls fresh numbers from SnapTrade, at most once a minute. */
export async function syncNowAction(formData: FormData): Promise<void> {
  const page = backTo(formData, "/settings");
  const viewer = await getViewer();
  if (viewer?.kind !== "user") redirect(page);
  const { snaptradeConfig } = await import("./env");
  const config = await snaptradeConfig();
  if (!config) redirect(`${page}?notice=sync-failed`);
  const { syncUser } = await import("./sync");
  let result: string;
  try {
    result = await syncUser(viewer.id, config, { minGapMs: 60_000 });
  } catch (cause) {
    console.error("manual sync failed", cause);
    result = "failed";
  }
  redirect(`${page}?notice=sync-${result}`);
}

/** Skips the rest of the first run and opens the demo league. */
export async function skipWelcomeAction(): Promise<void> {
  (await cookies()).set(WELCOME_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
  redirect("/league?league=demo");
}
