import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { OAUTH_COOKIE, completeSignIn } from "@/server/auth-flow";
import { safeEqual } from "@/server/crypto";
import { snaptradeConfig } from "@/server/env";
import { DEMO_PREFS_COOKIE } from "@/server/leagues";
import { startSession } from "@/server/session";
import { syncUser } from "@/server/sync";
import { DEMO_COOKIE } from "@/server/viewer";

/** Where SnapTrade sends the browser back after sign-in. */
export async function GET(request: NextRequest) {
  const config = await snaptradeConfig();
  // Redirects are built from APP_URL, never from the incoming Host header.
  const to = (path: string) =>
    NextResponse.redirect(
      new URL(path, config ? config.redirectUri : request.url),
    );
  if (!config) return to("/?notice=setup");

  const params = request.nextUrl.searchParams;
  const jar = await cookies();
  const expected = jar.get(OAUTH_COOKIE)?.value;
  jar.delete({ name: OAUTH_COOKIE, path: "/api/auth" });

  const error = params.get("error");
  if (error) {
    if (error === "access_denied") return to("/?notice=denied");
    // SnapTrade test apps hold five users. Its wording for that is a guess.
    const detail = params.get("error_description") ?? "";
    return to(
      /limit|maximum|too many/i.test(detail)
        ? "/?notice=full"
        : "/?notice=failed",
    );
  }

  const code = params.get("code");
  const state = params.get("state");
  // The state must be the one this browser started with.
  if (!code || !state || !expected || !safeEqual(state, expected)) {
    return to("/?notice=failed");
  }

  let signedIn: { userId: string; returnTo: string | null };
  try {
    signedIn = await completeSignIn(config, { code, state });
  } catch (cause) {
    console.error("sign-in failed", cause);
    return to("/?notice=failed");
  }

  await startSession(signedIn.userId);
  jar.delete(DEMO_COOKIE);
  jar.delete(DEMO_PREFS_COOKIE);
  try {
    // The first sync runs now so the league has something to show.
    await syncUser(signedIn.userId, config, { minGapMs: 0 });
  } catch (cause) {
    console.error("first sync failed", cause);
  }
  return to(signedIn.returnTo ?? "/league");
}
