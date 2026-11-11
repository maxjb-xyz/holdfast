import { NextResponse, type NextRequest } from "next/server";
import { safeReturnTo } from "@/lib/inputs";
import { ATTEMPT_MINUTES, OAUTH_COOKIE, beginSignIn } from "@/server/auth-flow";
import { snaptradeConfig } from "@/server/env";

/** Sends the browser to SnapTrade to sign in. */
export async function GET(request: NextRequest) {
  const config = await snaptradeConfig();
  if (!config) {
    return NextResponse.redirect(new URL("/?notice=setup", request.url));
  }
  const returnTo = safeReturnTo(request.nextUrl.searchParams.get("next"));
  const { url, state } = await beginSignIn(config, returnTo);
  const response = NextResponse.redirect(url);
  response.cookies.set(OAUTH_COOKIE, state, {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/auth",
    maxAge: ATTEMPT_MINUTES * 60,
  });
  return response;
}
