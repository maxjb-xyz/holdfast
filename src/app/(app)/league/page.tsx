import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BigReturn, Fact, Header, TabBar } from "@/components/chrome";
import { Icon, type IconName } from "@/components/icons";
import { LeagueChart, MiniChart } from "@/components/league-chart";
import { ago, quarterLabel, signedNumber, signedPercent } from "@/lib/format";
import {
  leaguePage,
  type FeedItem,
  type LeaguePage,
  type Range,
} from "@/lib/pages";
import { addDays } from "@/lib/quarters";
import { loadLeague } from "@/server/leagues";
import { requireViewer, today } from "@/server/viewer";
import { currentUser } from "@/server/session";
import { syncStatus } from "@/server/status";

export const metadata: Metadata = { title: "League" };

const RANGES: { key: Range; label: string }[] = [
  { key: "quarter", label: "Quarter" },
  { key: "month", label: "Month" },
  { key: "week", label: "Week" },
];

const FEED_ICON: Record<FeedItem["kind"], IconName> = {
  badge: "award",
  passed: "up",
  paused: "pause",
  joined: "userPlus",
  wrapped: "spark",
};

function href(page: LeaguePage, extra: Record<string, string> = {}) {
  const params = new URLSearchParams();
  if (!page.league.isDemo) params.set("league", page.league.id);
  for (const [k, v] of Object.entries(extra)) params.set(k, v);
  const query = params.toString();
  return query ? `/league?${query}` : "/league";
}

function Legend() {
  const swatch = (dash: string, cap?: "round") => (
    <svg width="22" height="6" viewBox="0 0 22 6" aria-hidden="true">
      <path
        d="M0 3H22"
        stroke="#646973"
        strokeWidth="1.5"
        strokeDasharray={dash}
        strokeLinecap={cap}
      />
    </svg>
  );
  return (
    <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1.5 text-xs text-grey">
      <span className="flex items-center gap-[7px]">{swatch("5 4")}Paused</span>
      <span className="flex items-center gap-[7px]">
        {swatch("1 5", "round")}Partial data
      </span>
      <Link
        href="/how-it-works"
        aria-label="How scoring works"
        className="hover-text flex size-8 items-center justify-center"
      >
        <Icon name="info" />
      </Link>
    </div>
  );
}

function Activity({ page, day }: { page: LeaguePage; day: string }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="label m-0 font-normal">Activity</h2>
      {page.feed.length === 0 ? (
        <p className="m-0 border-t border-b border-faint py-[9px] text-dim">
          Nothing yet. Moves and badges show up here as the quarter unfolds.
        </p>
      ) : (
        <ul className="m-0 list-none border-b border-faint p-0">
          {page.feed.map((item, i) => (
            <li
              key={i}
              className="flex items-center gap-3 border-t border-faint py-[9px]"
            >
              <span className="flex text-grey">
                <Icon name={FEED_ICON[item.kind]} />
              </span>
              <span className="flex-1">{item.text}</span>
              <span className="font-mono text-[11px] text-grey">
                {ago(item.date, day)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Closest({ page }: { page: LeaguePage }) {
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="label m-0 font-normal">Closest to a badge</h2>
      {page.closest.length === 0 ? (
        <p className="m-0 border-t border-b border-faint py-[9px] text-dim">
          Badges come from patient habits. Progress shows here once accounts
          sync.
        </p>
      ) : (
        <ul className="m-0 list-none border-b border-faint p-0">
          {page.closest.map((c, i) => (
            <li
              key={i}
              className="flex items-baseline gap-3 border-t border-faint py-[9px]"
            >
              <span className="w-[76px] flex-none truncate">{c.name}</span>
              <span className="flex-1 text-dim">{c.badge}</span>
              <span className="font-mono text-xs text-sub">{c.remaining}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function LastQuarter({ page }: { page: LeaguePage }) {
  const last = page.lastQuarter;
  if (!last) {
    return (
      <section className="flex flex-col gap-2.5">
        <h2 className="label m-0 font-normal">Last quarter</h2>
        <p className="m-0 border-t border-b border-faint py-[9px] text-dim">
          This is the league&rsquo;s first quarter. Final standings are saved
          here when it ends.
        </p>
      </section>
    );
  }
  return (
    <section className="flex flex-col gap-2.5">
      <h2 className="label m-0 font-normal">
        {quarterLabel(last.quarter.key)} final
      </h2>
      <ul className="m-0 list-none border-b border-faint p-0">
        {last.top.map((t, i) => (
          <li
            key={i}
            className="flex items-baseline gap-3 border-t border-faint py-[9px]"
          >
            <span className="w-[76px] flex-none">{t.place}</span>
            <span className={`flex-1 ${t.isYou ? "text-text" : "text-dim"}`}>
              {t.name}
            </span>
            <span className="font-mono text-xs text-sub">{t.value}</span>
          </li>
        ))}
        {last.youPlayed && (
          <li className="flex items-center border-t border-faint">
            <Link
              href={`/wrapped/${last.quarter.key}`}
              className="hover-text flex min-h-[39px] items-center gap-2"
            >
              Open your {last.quarter.key.split("-")[1]} Wrapped
              <Icon name="arrow" size={15} />
            </Link>
          </li>
        )}
      </ul>
    </section>
  );
}

function Notice({ show }: { show: boolean }) {
  if (show) {
    return (
      <div className="mx-5 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-b border-rule py-3 lg:mx-10">
        <span className="flex items-center gap-3">
          <span className="flex text-dim">
            <Icon name="pause" />
          </span>
          <span>
            Your brokerage link dropped. Your rank is paused, not lost, and your
            score is held where it was.
          </span>
        </span>
        <a
          href="/api/auth/start"
          className="hover-text flex min-h-11 items-center gap-2 font-medium"
        >
          Reconnect
          <Icon name="arrow" size={15} />
        </a>
      </div>
    );
  }
  return null;
}

export default async function LeagueRoute({
  searchParams,
}: {
  searchParams: Promise<{ league?: string; range?: string }>;
}) {
  const params = await searchParams;
  const viewer = await requireViewer();
  const league = await loadLeague(viewer, params.league);
  // A dropped link is flagged at once, a day before the rank shows as paused.
  const needsReconnect =
    viewer.kind === "user" && Boolean((await currentUser())?.pausedSince);
  if (!league) notFound();
  const day = today();
  const range = RANGES.find((r) => r.key === params.range)?.key ?? "quarter";
  const page = leaguePage(league, viewer.id, day, range);
  const quarterOnly =
    range === "quarter" ? page : leaguePage(league, viewer.id, day);
  const you = page.you;
  const profileHref = (userId: string) =>
    userId === viewer.id
      ? "/profile"
      : `/profile/${encodeURIComponent(userId)}${league.isDemo ? "" : `?league=${league.id}`}`;
  const kind = page.league.isDemo ? "Demo league" : "League";
  const members = `${page.league.memberCount} ${page.league.memberCount === 1 ? "member" : "members"}`;
  const quarterName = quarterLabel(page.quarter.key);
  const headline =
    you?.score.value != null ? signedNumber(you.score.value) : null;

  return (
    <>
      <Header
        active="League"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <Notice show={Boolean(page.you?.paused) || needsReconnect} />

      {/* Desktop */}
      <main className="mx-auto hidden w-full max-w-[1440px] flex-1 flex-col gap-9 px-10 pt-6 pb-10 lg:flex">
        {/* Side by side when there is room. Narrower, the summary sits above the chart. */}
        <div className="flex flex-col gap-y-9 xl:flex-row xl:gap-x-14">
          <section className="grid min-w-0 grid-cols-2 gap-x-14 gap-y-6 xl:flex xl:flex-[1_1_280px] xl:flex-col xl:gap-9">
            <div className="rise flex flex-col gap-3">
              <span className="label flex items-center gap-2">
                {kind} · {members}
                {viewer.kind === "user" && (
                  <Link href="/leagues" className="hover-text text-grey">
                    · Switch
                  </Link>
                )}
              </span>
              <h1 className="serif m-0 text-[40px] leading-[1.05]">
                {page.league.name}
              </h1>
            </div>
            {you ? (
              <div
                className="rise flex flex-col gap-1.5"
                style={{ "--i": 1.5 } as React.CSSProperties}
              >
                <span className="label flex items-center gap-2 !text-you">
                  <span
                    className="size-1.5 rounded-full bg-you"
                    aria-hidden="true"
                  />
                  You · {page.standing}
                </span>
                {headline ? (
                  <BigReturn
                    text={headline}
                    className="text-[84px]"
                    signClassName="text-[40px]"
                  />
                ) : (
                  <span className="py-3 text-dim">
                    Your score starts tomorrow. Everyone begins at 0% on the day
                    they join.
                  </span>
                )}
              </div>
            ) : null}
            {you && page.stats.length > 0 && (
              <div
                className="rise col-start-2 row-span-2 row-start-1 flex flex-col self-end border-b border-faint xl:-mt-4 xl:self-auto"
                style={{ "--i": 2.5 } as React.CSSProperties}
              >
                {page.stats.map((s) => (
                  <Fact key={s.label} {...s} />
                ))}
              </div>
            )}
            <div
              className="rise col-span-2 flex flex-col gap-2.5 xl:mt-auto"
              style={{ "--i": 4 } as React.CSSProperties}
            >
              <div className="flex justify-between font-mono text-[11px] tracking-[0.08em] text-dim">
                <span>
                  {quarterName.toUpperCase()} · WEEK {page.week} OF 13
                </span>
                <span className="text-grey">
                  {page.daysLeft === 0
                    ? "LAST DAY"
                    : `${page.daysLeft} ${page.daysLeft === 1 ? "DAY" : "DAYS"} LEFT`}
                </span>
              </div>
              <div
                className="grid grid-cols-[repeat(13,minmax(0,1fr))] gap-[3px]"
                aria-hidden="true"
              >
                {Array.from({ length: 13 }, (_, i) => (
                  <span
                    key={i}
                    className={`bar-grow h-[3px] ${i < page.week - 1 ? "bg-text" : i === page.week - 1 ? "bg-you" : "bg-rule"}`}
                    style={{ "--i": 4 + i * 0.5 } as React.CSSProperties}
                  />
                ))}
              </div>
            </div>
          </section>
          <section className="flex min-w-0 flex-col gap-5 xl:flex-[999_1_640px]">
            <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 pl-11">
              <div
                className="flex gap-0.5"
                role="group"
                aria-label="Chart range"
              >
                {RANGES.map((r) => (
                  <Link
                    key={r.key}
                    href={href(
                      page,
                      r.key === "quarter" ? {} : { range: r.key },
                    )}
                    aria-current={r.key === range ? "true" : undefined}
                    scroll={false}
                    className={`flex min-h-8 items-center rounded-full px-3 text-[12.5px] font-medium transition-colors ${
                      r.key === range
                        ? "bg-chip text-text"
                        : "text-dim hover:text-text"
                    }`}
                  >
                    {r.label}
                  </Link>
                ))}
              </div>
              <Legend />
            </div>
            <LeagueChart page={page} profileHref={profileHref} />
          </section>
        </div>
        <div className="grid grid-cols-3 gap-x-14 gap-y-8">
          {[
            <Activity key="a" page={page} day={day} />,
            <Closest key="c" page={page} />,
            <LastQuarter key="l" page={page} />,
          ].map((block, i) => (
            <div
              key={block.key}
              className="rise"
              style={{ "--i": 6 + i * 1.5 } as React.CSSProperties}
            >
              {block}
            </div>
          ))}
        </div>
      </main>

      {/* Phone */}
      <main className="mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-3 px-5 pt-3 pb-28 lg:hidden">
        <div className="rise flex flex-col gap-1">
          <span className="label !text-[10px]">
            {kind} · {page.quarter.key.split("-")[1]} · Week {page.week} of 13
          </span>
          <h1 className="serif m-0 text-[28px] leading-[1.1]">
            {page.league.name}
          </h1>
        </div>
        {you && (
          <div
            className="rise flex items-end justify-between gap-3"
            style={{ "--i": 1.5 } as React.CSSProperties}
          >
            {headline ? (
              <BigReturn
                text={headline}
                className="text-[58px]"
                signClassName="text-[28px]"
              />
            ) : (
              <span className="py-2 text-dim">Your score starts tomorrow.</span>
            )}
            <span className="flex flex-col items-end gap-0.5 pb-1 font-mono text-[11px]">
              <span className="uppercase text-you">{page.standing}</span>
              {you.week.value !== null && !you.paused && (
                <span className="text-dim">
                  {signedNumber(you.week.value)} THIS WEEK
                </span>
              )}
            </span>
          </div>
        )}
        <div className="-mx-5">
          <MiniChart
            rows={quarterOnly.rows}
            asOf={page.asOf}
            origin={addDays(page.quarter.start, -1)}
            hover
          />
        </div>
        <ul className="m-0 list-none border-b border-faint p-0">
          {quarterOnly.rows.map((row, i) => {
            const tone = row.isYou
              ? "text-you"
              : row.paused
                ? "text-dim"
                : "text-text";
            return (
              <li
                key={row.userId}
                className="rise border-t border-faint"
                style={{ "--i": 4 + i } as React.CSSProperties}
              >
                <Link
                  href={profileHref(row.userId)}
                  className="flex min-h-[50px] items-center gap-3.5 transition-opacity active:opacity-60"
                >
                  <span className="w-3.5 font-mono text-xs text-dim">
                    {row.rank ?? "–"}
                  </span>
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span
                      className={`truncate text-[15px] font-medium ${tone}`}
                    >
                      {row.shownName}
                    </span>
                    {row.note && (
                      <span className="text-xs text-grey">{row.note}</span>
                    )}
                  </span>
                  <span className="flex flex-col items-end leading-[1.3]">
                    <span className={`font-mono text-sm ${tone}`}>
                      {row.score.value === null
                        ? "–"
                        : signedPercent(row.score.value)}
                    </span>
                    {!row.paused && row.week.value !== null && (
                      <span className="font-mono text-[11px] text-grey">
                        {signedNumber(row.week.value)} 7d
                      </span>
                    )}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-between font-mono text-[11px] text-grey">
          <span className="flex items-center gap-1.5">
            <Icon name="sync" size={12} />
            {await syncStatus(viewer)}
          </span>
          <span>
            {page.daysLeft === 0
              ? "Resets tomorrow"
              : `Resets in ${page.daysLeft} ${page.daysLeft === 1 ? "day" : "days"}`}
          </span>
        </div>
        <div className="mt-5 flex flex-col gap-8">
          <Activity page={page} day={day} />
          <Closest page={page} />
          <LastQuarter page={page} />
        </div>
      </main>
      <TabBar active="League" />
    </>
  );
}
