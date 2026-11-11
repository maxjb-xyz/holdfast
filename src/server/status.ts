import "server-only";
import { shortDate } from "@/lib/format";
import { toDateString } from "@/lib/quarters";
import { currentUser } from "./session";
import type { Viewer } from "./viewer";

/** The short line in the header that says how fresh the numbers are. */
export async function syncStatus(viewer: Viewer): Promise<string> {
  if (viewer.kind === "demo") return "Demo data";
  const user = await currentUser();
  if (!user?.lastSyncedAt) return "First sync pending";
  return `Synced ${shortDate(toDateString(user.lastSyncedAt))}`;
}
