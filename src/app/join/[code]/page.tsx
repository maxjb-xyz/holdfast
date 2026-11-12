import type { Metadata } from "next";
import Link from "next/link";
import { Wordmark } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { plural } from "@/lib/format";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { joinLeagueAction } from "@/server/actions";
import { MAX_LEAGUES_PER_PERSON, previewInvite } from "@/server/league-admin";
import { getViewer } from "@/server/viewer";

export const metadata: Metadata = {
  title: "League invite",
  robots: { index: false },
};

const solid =
  "flex min-h-12 cursor-pointer items-center gap-2.5 rounded-full border-0 bg-text px-[22px] text-[15px] font-semibold text-bg transition-colors hover:bg-white";

export default async function JoinRoute({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ notice?: string }>;
}) {
  const { code } = await params;
  const { notice } = await searchParams;
  const viewer = await getViewer();
  const user = viewer?.kind === "user" ? viewer : null;
  let invite = null;
  try {
    invite = await previewInvite(code, user?.id ?? null);
  } catch (error) {
    console.error("invite lookup failed", error);
  }
  const full = invite !== null && invite.members >= MAX_LEAGUE_MEMBERS;

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1.5 lg:px-10 lg:py-3.5">
        <Wordmark href={viewer ? "/league" : "/"} />
        <Link
          href="/how-it-works"
          className="hover-text flex min-h-11 items-center font-medium text-dim"
        >
          How it works
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-7 px-5 pt-6 pb-16 lg:px-10">
        {!invite ? (
          <>
            <span className="label">League invite</span>
            <h1 className="serif m-0 text-[40px] leading-[1.05]">
              This invite does not lead anywhere.
            </h1>
            <p className="m-0 max-w-[46ch] text-[17px] text-sub">
              The link may be mistyped, or the league may have been removed. Ask
              your friend for a fresh one.
            </p>
            <Link
              href={viewer ? "/leagues" : "/"}
              className="hover-text flex min-h-11 items-center gap-2 font-medium text-sub"
            >
              {viewer ? "Back to your leagues" : "Go to Holdfast"}
              <Icon name="arrow" size={15} />
            </Link>
          </>
        ) : (
          <>
            <span className="label">
              You are invited · {plural(invite.members, "member")}
            </span>
            <h1 className="serif m-0 text-[clamp(40px,7vw,64px)] leading-[1.02]">
              {invite.name}
            </h1>
            <p className="m-0 max-w-[46ch] text-[17px] text-sub">
              A quarterly league scored on percentage return, with deposits
              taken out. You start at 0% today and are scored from tomorrow.
              Nobody sees a dollar amount.
            </p>
            {notice === "too-many" && (
              <p
                role="status"
                className="m-0 border-t border-b border-rule py-3 text-sub"
              >
                You can be in up to {MAX_LEAGUES_PER_PERSON} leagues at a time.
                Leave one to join this one.
              </p>
            )}
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              {invite.alreadyIn ? (
                <Link
                  href={`/league?league=${invite.leagueId}`}
                  className={solid}
                >
                  Open the league
                  <Icon name="arrow" size={16} stroke={1.8} />
                </Link>
              ) : full ? (
                <p className="m-0 border-t border-b border-rule py-3 text-sub">
                  This league already has {MAX_LEAGUE_MEMBERS} members, which is
                  the most a league can hold.
                </p>
              ) : user ? (
                <form action={joinLeagueAction}>
                  <input type="hidden" name="code" value={code} />
                  <button type="submit" className={solid}>
                    Join as {user.name}
                    <Icon name="arrow" size={16} stroke={1.8} />
                  </button>
                </form>
              ) : (
                <a
                  href={`/api/auth/start?next=${encodeURIComponent(`/join/${code}`)}`}
                  className={solid}
                >
                  Continue with SnapTrade
                  <Icon name="arrow" size={16} stroke={1.8} />
                </a>
              )}
            </div>
            {!user && !invite.alreadyIn && !full && (
              <p className="m-0 flex items-center gap-2 text-xs text-grey">
                <Icon name="lock" size={12} />
                Read-only. Holdfast can never place a trade.
              </p>
            )}
          </>
        )}
      </main>
    </>
  );
}
