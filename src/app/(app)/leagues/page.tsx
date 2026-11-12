import type { Metadata } from "next";
import Link from "next/link";
import { Header, SectionHead, TabBar } from "@/components/chrome";
import { CopyLink } from "@/components/copy-link";
import { Icon } from "@/components/icons";
import { Spark } from "@/components/quarter-charts";
import { Notice, Segments, field, outline, solid } from "@/components/ui";
import { plural, quarterLabel, signedNumber, signedPercent } from "@/lib/format";
import { leagueSummary, type LeagueSummaryRow } from "@/lib/full-pages";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { daysInclusive, quarterOf } from "@/lib/quarters";
import { openInviteAction } from "@/server/actions";
import { MAX_LEAGUES_PER_PERSON, myLeagues } from "@/server/league-admin";
import { loadLeague } from "@/server/leagues";
import { siteOrigin } from "@/server/me";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Leagues" };

const NOTICES: Record<string, string> = {
  left: "You left the league. Your own scores and badges are kept.",
  deleted: "The league is deleted. Everyone keeps their own scores and badges.",
  "too-many": `You can be in up to ${MAX_LEAGUES_PER_PERSON} leagues at a time.`,
  "not-found": "That invite link or code does not match a league.",
  disconnected:
    "SnapTrade is disconnected. Your rank is paused until you sign in again.",
  "disconnected-check":
    "Your tokens are deleted and your rank is paused. SnapTrade did not confirm that access was revoked, so please also remove Holdfast in your SnapTrade settings.",
};

const COLS =
  "grid grid-cols-[minmax(0,1fr)_64px_72px] items-center gap-x-3.5 lg:grid-cols-[minmax(0,1fr)_150px_110px_96px_20px] lg:gap-x-8";

function Row({ row, index }: { row: LeagueSummaryRow; index: number }) {
  const tone = row.isDemo ? "text-sub" : "text-text";
  const role = row.isDemo
    ? "Demo, made-up rivals"
    : row.isOwner
      ? "Yours"
      : "Member";
  const full = row.memberCount >= MAX_LEAGUE_MEMBERS;
  return (
    <li
      className="hf-row hf-hover relative border-t border-faint"
      style={{ "--i": index } as React.CSSProperties}
    >
      <div className={`${COLS} min-h-[76px] lg:min-h-[84px]`}>
        <span className="flex min-w-0 flex-col gap-1">
          <Link
            href={row.isDemo ? "/league?league=demo" : `/league?league=${row.id}`}
            className={`serif truncate text-[20px] leading-[1.15] after:absolute after:inset-0 lg:text-2xl ${tone}`}
          >
            {row.name}
          </Link>
          <span className="label flex flex-wrap items-center gap-x-1.5 !text-[10px] !text-grey lg:!text-[11px]">
            <span className="lg:hidden">{row.standing} ·</span>
            <span className="hidden lg:inline">
              {plural(row.memberCount, "member")}
              {full ? " · full" : ""} ·
            </span>
            {role}
            {!row.isDemo && (
              <Link
                href={`/leagues/${row.id}`}
                className="hover-text relative z-10 -my-3 py-3 text-dim underline decoration-rule underline-offset-4"
              >
                {row.isOwner ? "Manage" : "Details"}
              </Link>
            )}
          </span>
        </span>
        <span className="hidden lg:block">
          <Spark series={row.series} quiet={row.isDemo} />
        </span>
        <span className="lg:hidden">
          <Spark series={row.series} width={64} height={26} quiet={row.isDemo} />
        </span>
        <span className="hidden flex-col leading-[1.35] lg:flex">
          <span className={tone}>{row.standing}</span>
          {row.week !== null && (
            <span className="font-mono text-[11px] text-grey">
              {signedNumber(row.week)} 7d
            </span>
          )}
        </span>
        <span
          className={`text-right font-mono text-sm lg:text-[17px] ${row.isDemo ? "text-sub" : "text-you"}`}
        >
          {row.value === null ? "–" : signedPercent(row.value)}
        </span>
        <span className="hidden text-grey lg:flex">
          <Icon name="right" />
        </span>
      </div>
    </li>
  );
}

export default async function LeaguesRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const quarter = quarterOf(day);
  const week = Math.min(13, Math.ceil(daysInclusive(quarter.start, day) / 7));
  const mine = viewer.kind === "user" ? await myLeagues(viewer.id) : [];
  const loaded = await Promise.all([
    ...mine.map((l) => loadLeague(viewer, l.id)),
    loadLeague(viewer, "demo"),
  ]);
  const rows = loaded
    .filter((l) => l !== null)
    .map((l) => leagueSummary(l, viewer.id, day));
  // The league most worth sharing: one of your own with places still open.
  const open = mine.find((l) => l.isOwner && l.members < MAX_LEAGUE_MEMBERS);
  const base = open ? await siteOrigin() : "";

  return (
    <>
      <Header
        active="League"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-start gap-x-[72px] gap-y-12 px-5 pt-3 pb-28 lg:px-10 lg:pt-6 lg:pb-10">
        <section className="flex min-w-0 flex-[999_1_620px] flex-col gap-7">
          <div className="flex flex-wrap items-end justify-between gap-x-8 gap-y-4">
            <div className="flex flex-col gap-1 lg:gap-3">
              <span className="label">
                {quarterLabel(quarter.key)} · Week {week} of 13
              </span>
              <h1 className="m-0 text-[28px] leading-[1.05] font-medium tracking-[-0.035em] lg:text-[40px]">
                Your leagues
              </h1>
            </div>
            <Link href="/leagues/new" className={solid}>
              <Icon name="plus" size={15} stroke={2} />
              New league
            </Link>
          </div>
          <Notice>{notice}</Notice>
          <div className="flex flex-col gap-2.5">
            <div className={`${COLS} label !text-grey`}>
              <span>
                {viewer.kind === "user"
                  ? `${mine.length} of ${plural(MAX_LEAGUES_PER_PERSON, "league")}`
                  : "Demo"}
              </span>
              <span className="hidden lg:block">Your quarter</span>
              <span className="hidden lg:block">Standing</span>
              <span className="col-span-2 text-right lg:col-span-1">Return</span>
              <span className="hidden lg:block" />
            </div>
            <ul className="m-0 list-none border-b border-faint p-0">
              {rows.map((row, i) => (
                <Row key={row.id} row={row} index={i} />
              ))}
            </ul>
            <p className="m-0 text-xs text-grey">
              {mine.length === 0
                ? "You are not in a league yet. Start one, or paste an invite from a friend."
                : "Your return follows you from league to league. Standings differ because the rivals and start dates do."}
            </p>
          </div>
        </section>
        <aside className="flex min-w-0 flex-[1_1_300px] flex-col gap-10 lg:pt-24">
          <section className="flex flex-col gap-2.5">
            <SectionHead title="Join with an invite" />
            <form
              action={openInviteAction}
              className="flex flex-wrap gap-3 border-t border-b border-faint py-3.5"
            >
              <label htmlFor="invite-code" className="sr-only">
                Invite link or code
              </label>
              <input
                id="invite-code"
                name="code"
                required
                maxLength={300}
                placeholder="Invite link or code"
                autoComplete="off"
                className={field}
              />
              <button type="submit" className={outline}>
                Open
              </button>
            </form>
          </section>
          {open && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Waiting on friends" aside={open.name} />
              <div className="flex flex-col border-b border-faint">
                <div className="flex flex-col gap-2.5 border-t border-faint py-3.5">
                  <span className="flex justify-between gap-4">
                    <span>
                      {open.members} of {MAX_LEAGUE_MEMBERS} places taken
                    </span>
                    <span className="font-mono text-xs text-sub">
                      {MAX_LEAGUE_MEMBERS - open.members} open
                    </span>
                  </span>
                  <Segments done={open.members} of={MAX_LEAGUE_MEMBERS} />
                </div>
                <div className="flex min-h-[52px] items-center border-t border-faint">
                  <CopyLink url={`${base}/join/${open.inviteCode}`} />
                </div>
              </div>
            </section>
          )}
          {viewer.kind === "demo" && (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Play for real" />
              <div className="flex flex-col gap-3 border-t border-b border-faint py-3.5">
                <span className="text-dim">
                  You are exploring the demo. Sign in with SnapTrade to make a
                  league and invite friends. Access is read-only.
                </span>
                <a href="/api/auth/start?next=/leagues" className={`${solid} self-start`}>
                  Continue with SnapTrade
                  <Icon name="arrow" size={15} stroke={1.8} />
                </a>
              </div>
            </section>
          )}
        </aside>
      </main>
      <TabBar active="League" />
    </>
  );
}
