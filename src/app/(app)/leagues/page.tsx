import type { Metadata } from "next";
import { headers } from "next/headers";
import Link from "next/link";
import { Header, SectionHead, TabBar } from "@/components/chrome";
import { CopyLink } from "@/components/copy-link";
import { Icon } from "@/components/icons";
import { demoLeague } from "@/lib/demo";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { plural } from "@/lib/format";
import {
  createLeagueAction,
  deleteEverythingAction,
  disconnectAction,
  leave,
  leaveLeagueAction,
  openInviteAction,
} from "@/server/actions";
import { appUrl } from "@/server/env";
import { LEAGUE_NAME_MAX } from "@/lib/inputs";
import { MAX_LEAGUES_PER_PERSON, myLeagues } from "@/server/league-admin";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Leagues" };

const NOTICES: Record<string, string> = {
  created: "League made. Send the invite link to up to seven friends.",
  left: "You left the league. Your own scores and badges are kept.",
  name: "Give the league a name first.",
  "too-many": `You can be in up to ${MAX_LEAGUES_PER_PERSON} leagues at a time.`,
  "not-found": "That invite link or code does not match a league.",
  signin: "Sign in with SnapTrade to make a league of your own.",
  disconnected:
    "SnapTrade is disconnected. Your rank is paused until you sign in again.",
  "disconnected-check":
    "Your tokens are deleted and your rank is paused. SnapTrade did not confirm that access was revoked, so please also remove Holdfast in your SnapTrade settings.",
};

const field =
  "min-h-11 w-full min-w-0 flex-1 rounded-full border border-rule bg-transparent px-4 text-text outline-none transition-colors placeholder:text-grey focus:border-sub";
const solid =
  "flex min-h-11 flex-none cursor-pointer items-center gap-2 rounded-full border-0 bg-text px-[18px] text-[13px] font-semibold text-bg transition-colors hover:bg-white";
const quiet =
  "hover-text flex min-h-11 cursor-pointer list-none items-center gap-2 border-0 bg-transparent p-0 text-dim";
const danger =
  "flex min-h-10 cursor-pointer items-center rounded-full border border-rule bg-transparent px-4 text-[13px] font-semibold text-text transition-colors hover:border-sub";

async function origin(): Promise<string> {
  const configured = await appUrl();
  if (configured) return configured;
  const h = await headers();
  const host = h.get("host") ?? "localhost";
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`;
}

export default async function LeaguesRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const isUser = viewer.kind === "user";
  const leagues = isUser ? await myLeagues(viewer.id) : [];
  const base = await origin();

  return (
    <>
      <Header
        active={null}
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-10 px-5 pt-6 pb-28 lg:px-10 lg:pb-16">
        <div className="flex flex-col gap-3">
          <span className="label">Leagues and invites</span>
          <h1 className="serif m-0 text-[32px] leading-[1.05] lg:text-[40px]">
            Your leagues
          </h1>
        </div>

        {notice && (
          <p
            role="status"
            className="m-0 flex items-start gap-3 border-t border-b border-rule py-3 text-sub"
          >
            <span className="mt-0.5 flex text-dim">
              <Icon name="info" />
            </span>
            {notice}
          </p>
        )}

        <section className="flex flex-col gap-2.5">
          <SectionHead
            title="You are in"
            aside={`Up to ${MAX_LEAGUE_MEMBERS} people each`}
          />
          <ul className="m-0 list-none border-b border-faint p-0">
            {leagues.map((l) => (
              <li
                key={l.id}
                className="flex flex-col gap-2 border-t border-faint py-3.5"
              >
                <div className="flex items-baseline justify-between gap-4">
                  <Link
                    href={`/league?league=${l.id}`}
                    className="hover-text flex min-w-0 items-center gap-2 text-[15px] font-medium"
                  >
                    <span className="truncate">{l.name}</span>
                    <Icon name="arrow" size={15} />
                  </Link>
                  <span className="flex-none font-mono text-[11px] text-grey">
                    {plural(l.members, "member").toUpperCase()}
                    {l.isOwner ? " · YOURS" : ""}
                  </span>
                </div>
                {l.members < MAX_LEAGUE_MEMBERS ? (
                  <CopyLink url={`${base}/join/${l.inviteCode}`} />
                ) : (
                  <span className="text-xs text-grey">
                    This league is full, so its invite link is closed.
                  </span>
                )}
                <details>
                  <summary className={`${quiet} min-h-9 text-[13px]`}>
                    Leave this league
                  </summary>
                  <form
                    action={leaveLeagueAction}
                    className="flex flex-wrap items-center gap-x-4 gap-y-2 pt-1 pb-1"
                  >
                    <input type="hidden" name="leagueId" value={l.id} />
                    <span className="flex-[1_1_240px] text-[13px] text-dim">
                      Your score here stops. If you rejoin later you start
                      again from that day.
                      {l.members === 1
                        ? " You are the only member, so the league is removed."
                        : l.isOwner
                          ? " The league passes to its longest-standing member."
                          : ""}
                    </span>
                    <button type="submit" className={danger}>
                      Leave {l.name}
                    </button>
                  </form>
                </details>
              </li>
            ))}
            <li className="flex items-baseline justify-between gap-4 border-t border-faint py-3.5">
              <Link
                href="/league?league=demo"
                className="hover-text flex items-center gap-2 text-[15px] font-medium"
              >
                {demoLeague(today()).name}
                <Icon name="arrow" size={15} />
              </Link>
              <span className="font-mono text-[11px] text-grey">
                DEMO · MADE-UP RIVALS
              </span>
            </li>
          </ul>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionHead title="Start a league" />
          {isUser ? (
            <form
              action={createLeagueAction}
              className="flex flex-wrap items-center gap-3 border-t border-b border-faint py-3.5"
            >
              <label htmlFor="league-name" className="sr-only">
                League name
              </label>
              <input
                id="league-name"
                name="name"
                required
                maxLength={LEAGUE_NAME_MAX}
                placeholder="League name"
                autoComplete="off"
                className={field}
              />
              <button type="submit" className={solid}>
                <Icon name="plus" size={15} stroke={2} />
                Make league
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-b border-faint py-3.5">
              <span className="flex-[1_1_260px] text-dim">
                You are exploring the demo. Sign in with SnapTrade to make a
                league and invite friends. Access is read-only.
              </span>
              <a href="/api/auth/start?next=/leagues" className={solid}>
                Continue with SnapTrade
                <Icon name="arrow" size={15} stroke={1.8} />
              </a>
            </div>
          )}
          <p className="m-0 text-xs text-grey">
            Everyone starts at 0% on the day they join and is scored from the
            next day. Leagues reset each calendar quarter.
          </p>
        </section>

        <section className="flex flex-col gap-2.5">
          <SectionHead title="Join with an invite" />
          <form
            action={openInviteAction}
            className="flex flex-wrap items-center gap-3 border-t border-b border-faint py-3.5"
          >
            <label htmlFor="invite-code" className="sr-only">
              Invite link or code
            </label>
            <input
              id="invite-code"
              name="code"
              required
              maxLength={300}
              placeholder="Paste an invite link or code"
              autoComplete="off"
              className={field}
            />
            <button type="submit" className={solid}>
              Open invite
            </button>
          </form>
        </section>

        <section className="flex scroll-mt-6 flex-col gap-2.5" id="data">
          <SectionHead
            title="Your data"
            aside={
              <>
                <Icon name="lock" size={12} />
                Read-only
              </>
            }
          />
          {isUser ? (
            <div className="flex flex-col border-b border-faint">
              <p className="m-0 border-t border-faint py-3 text-dim">
                Holdfast keeps a daily percentage return for each account, your
                habits as dates and tickers, and your badges. Balances are kept
                for ten days to correct late-reported deposits.{" "}
                <Link
                  href="/how-it-works"
                  className="text-sub underline decoration-rule underline-offset-4"
                >
                  How it works
                </Link>
              </p>
              <details className="border-t border-faint">
                <summary className={quiet}>Disconnect SnapTrade</summary>
                <form
                  action={disconnectAction}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3.5"
                >
                  <span className="flex-[1_1_240px] text-[13px] text-dim">
                    Revokes Holdfast&rsquo;s access and deletes the stored
                    tokens. Your history stays and your rank shows as paused
                    until you sign in again.
                  </span>
                  <button type="submit" className={danger}>
                    Disconnect
                  </button>
                </form>
              </details>
              <details className="border-t border-faint">
                <summary className={quiet}>Delete everything</summary>
                <form
                  action={deleteEverythingAction}
                  className="flex flex-wrap items-center gap-x-4 gap-y-2 pb-3.5"
                >
                  <span className="flex-[1_1_240px] text-[13px] text-dim">
                    One step, and it cannot be undone. Revokes SnapTrade
                    access, removes you from every league, and deletes your
                    returns, habits, badges and balances. Share cards you
                    already sent keep working. They hold a first name and
                    percentages only.
                  </span>
                  <button type="submit" className={danger}>
                    Delete all my data
                  </button>
                </form>
              </details>
            </div>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-b border-faint py-3.5">
              <span className="flex-[1_1_260px] text-dim">
                The demo stores nothing about you. Its rivals are made up and
                your switches live in a cookie on this device.
              </span>
              <form action={leave}>
                <button type="submit" className={danger}>
                  Exit the demo
                </button>
              </form>
            </div>
          )}
        </section>
      </main>
      <TabBar active={null} />
    </>
  );
}
