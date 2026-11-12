import type { Metadata } from "next";
import { Fact, Header, SectionHead, TabBar } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { NewLeagueForm } from "@/components/new-league-form";
import { PreviewChart } from "@/components/quarter-charts";
import { Notice, solidBig } from "@/components/ui";
import { quarterLabel, shortDate } from "@/lib/format";
import { leagueSummary } from "@/lib/full-pages";
import { LEAGUE_NAME_MAX } from "@/lib/inputs";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { addDays, quarterOf } from "@/lib/quarters";
import { createLeagueAction } from "@/server/actions";
import { MAX_LEAGUES_PER_PERSON } from "@/server/league-admin";
import { loadLeague } from "@/server/leagues";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "New league" };

const NOTICES: Record<string, string> = {
  name: "Give the league a name first.",
  "too-many": `You can be in up to ${MAX_LEAGUES_PER_PERSON} leagues at a time. Leave one to start another.`,
};

export default async function NewLeagueRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const quarter = quarterOf(day);
  const header = (
    <Header
      active="League"
      initial={viewer.name.charAt(0).toUpperCase()}
      status={await syncStatus(viewer)}
    />
  );

  if (viewer.kind !== "user") {
    return (
      <>
        {header}
        <main className="mx-auto flex w-full max-w-[640px] flex-1 flex-col justify-center gap-7 px-5 pt-6 pb-28 lg:px-10 lg:pb-16">
          <span className="label">New league</span>
          <h1 className="serif m-0 text-[40px] leading-[1.05]">
            A league of your own needs a real account.
          </h1>
          <p className="m-0 max-w-[46ch] text-[17px] text-sub">
            You are exploring the demo. Sign in with SnapTrade to make a league
            and invite friends. Access is read-only.
          </p>
          <a
            href="/api/auth/start?next=/leagues/new"
            className={`${solidBig} self-start`}
          >
            Continue with SnapTrade
            <Icon name="arrow" size={16} stroke={1.8} />
          </a>
        </main>
        <TabBar active="League" />
      </>
    );
  }

  const own = await loadLeague(viewer, "demo");
  // In the demo league a person is scored from the day they signed up, which
  // is as much of their own line as there is to preview.
  const series = own ? leagueSummary(own, viewer.id, day).series : [];
  const places = MAX_LEAGUE_MEMBERS - 1;

  return (
    <>
      {header}
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-8 px-5 pt-6 pb-28 lg:px-10 lg:pb-10">
        <Notice>{notice}</Notice>
        <div className="flex flex-wrap items-start gap-x-[72px] gap-y-12">
          <NewLeagueForm
            action={createLeagueAction}
            maxName={LEAGUE_NAME_MAX}
            places={MAX_LEAGUE_MEMBERS}
            quarterLabel={quarterLabel(quarter.key)}
            picker={{
              quarterStart: quarter.start,
              quarterStartLabel: shortDate(quarter.start),
              todayLabel: shortDate(day),
              earliest: addDays(day, -365),
              latest: addDays(day, -1),
            }}
            previewFromQuarter={
              <PreviewChart
                quarter={quarter}
                today={day}
                series={series}
                places={places}
              />
            }
            previewFromToday={
              <PreviewChart
                quarter={quarter}
                today={day}
                series={[]}
                places={places}
              />
            }
            facts={
              <div className="flex flex-col gap-2.5">
                <SectionHead title="How it runs" />
                <div className="flex flex-col border-b border-faint">
                  <Fact
                    label="Places"
                    value={`${MAX_LEAGUE_MEMBERS}, by invite link`}
                  />
                  <Fact label="Scored on" value="Percentage return" />
                  <Fact label="Resets" value="Every calendar quarter" />
                  <Fact label="You are" value="The owner" />
                </div>
              </div>
            }
          />
        </div>
      </main>
      <TabBar active="League" />
    </>
  );
}
