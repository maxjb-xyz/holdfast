"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { DEMO_PREFS_COOKIE, readDemoPrefs } from "./leagues";
import { endSession } from "./session";
import { DEMO_COOKIE, getViewer } from "./viewer";

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
  redirect("/profile");
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
  redirect("/profile");
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
