import "server-only";
import { cookies } from "next/headers";
import { DEMO_VIEWER_ID } from "@/lib/demo";
import { toDateString } from "@/lib/quarters";
import { currentUser } from "./session";

/** Who is looking at the app: a signed-in person, or a visitor exploring the demo. */
export type Viewer =
  | { kind: "demo"; id: string; name: string }
  | { kind: "user"; id: string; name: string };

export const DEMO_COOKIE = "hf_demo";

/** Today's date. Scores are kept per UTC day. */
export function today(): string {
  return toDateString(new Date());
}

export async function getViewer(): Promise<Viewer | null> {
  const user = await currentUser();
  if (user) return { kind: "user", id: user.id, name: user.displayName };
  const jar = await cookies();
  if (jar.get(DEMO_COOKIE)?.value === "1") {
    return { kind: "demo", id: DEMO_VIEWER_ID, name: "You" };
  }
  return null;
}
