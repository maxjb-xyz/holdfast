import { NextResponse, type NextRequest } from "next/server";
import { currentUser } from "@/server/session";
import { DEMO_COOKIE } from "@/server/viewer";

/**
 * A direct link into the demo league, for sharing: /demo opens it in one
 * click with no sign-in. Someone already signed in goes to the demo league
 * as themselves instead.
 */
export async function GET(request: NextRequest) {
  if (await currentUser()) {
    return NextResponse.redirect(new URL("/league?league=demo", request.url));
  }
  const response = NextResponse.redirect(new URL("/league", request.url));
  response.cookies.set(DEMO_COOKIE, "1", {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return response;
}
