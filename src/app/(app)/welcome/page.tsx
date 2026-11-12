import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountRows } from "@/components/account-rows";
import { SectionHead } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { StartChart } from "@/components/quarter-charts";
import { BareHeader, Notice, Stepper, quiet, solidBig } from "@/components/ui";
import { plural, quarterLabel } from "@/lib/format";
import { accountLine, leagueSummary } from "@/lib/full-pages";
import { daysInclusive, quarterOf } from "@/lib/quarters";
import { leave, syncNowAction } from "@/server/actions";
import { loadLeague } from "@/server/leagues";
import { myAccounts } from "@/server/me";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Welcome" };

const NOTICES: Record<string, string> = {
  "sync-synced": "Synced. Your accounts are up to date.",
  "sync-busy": "A sync ran a moment ago. Give it a minute and try again.",
  "sync-reconnect":
    "SnapTrade needs you to sign in again before Holdfast can read your accounts.",
  "sync-failed": "The sync did not finish. Please try again in a minute.",
};

export default async function WelcomeRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.kind !== "user") redirect("/league");
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const quarter = quarterOf(day);
  const accounts = (await myAccounts(viewer)).map(accountLine);
  // A person's own line is the same in every league, so the demo league is
  // enough to find out whether they have one yet.
  const own = await loadLeague(viewer, "demo");
  const series = own ? leagueSummary(own, viewer.id, day).series : [];
  const counted = accounts.filter((a) => a.counted).length;
  const week = Math.min(13, Math.ceil(daysInclusive(quarter.start, day) / 7));
  const daysLeft = daysInclusive(day, quarter.end) - 1;
  const firstName = viewer.name.split(" ")[0];

  return (
    <>
      <BareHeader>
        <form action={leave}>
          <button type="submit" className={`${quiet} font-medium`}>
            Sign out
          </button>
        </form>
      </BareHeader>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-start gap-x-[72px] gap-y-12 px-5 pt-6 pb-16 lg:px-10 lg:pb-10">
        <section className="flex max-w-[520px] min-w-0 flex-[1_1_400px] flex-col gap-8">
          <Stepper active={1} />
          <div className="hf-rise flex flex-col gap-3">
            <span className="label">Welcome, {firstName}</span>
            <h1 className="serif m-0 text-[32px] leading-[1.05] lg:text-[48px]">
              Choose what counts.
            </h1>
            <p className="m-0 max-w-[44ch] text-[15px] text-sub">
              {accounts.length === 0
                ? "Holdfast has not received any accounts from SnapTrade yet. Link a brokerage there, then sync."
                : `SnapTrade shared ${plural(accounts.length, "account")}. Pick the ones that make up your score. Friends see one blended percentage and never a balance.`}
            </p>
          </div>
          <Notice>{notice}</Notice>
          <div className="flex flex-col gap-2.5">
            <SectionHead
              title="Linked accounts"
              aside={
                <>
                  <Icon name="lock" size={12} />
                  Read-only
                </>
              }
            />
            {accounts.length === 0 ? (
              <p className="m-0 border-t border-b border-faint py-3 text-dim">
                Nothing here yet. Accounts appear after the first sync.
              </p>
            ) : (
              <div className="border-b border-faint">
                <AccountRows accounts={accounts} back="/welcome" />
              </div>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-6">
              <a
                href="https://dashboard.snaptrade.com"
                target="_blank"
                rel="noreferrer"
                className={quiet}
              >
                <Icon name="plus" size={15} />
                Link another brokerage in SnapTrade
              </a>
              <form action={syncNowAction}>
                <input type="hidden" name="back" value="/welcome" />
                <button type="submit" className={quiet}>
                  <Icon name="sync" size={15} />
                  Sync now
                </button>
              </form>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
            <Link href="/welcome/league" className={solidBig}>
              Continue
              <Icon name="arrow" size={16} stroke={1.8} />
            </Link>
            <span className="text-xs text-grey">
              You can change this any time in Settings.
            </span>
          </div>
        </section>
        <section className="flex min-w-0 flex-[999_1_520px] flex-col gap-5 lg:pt-[59px]">
          <div className="flex items-baseline justify-between gap-4 lg:pl-11">
            <span className="label">
              {quarterLabel(quarter.key)} · Week {week} of 13
            </span>
            <span className="label !text-grey">
              {daysLeft === 0 ? "Last day" : `${plural(daysLeft, "day")} left`}
            </span>
          </div>
          <StartChart quarter={quarter} today={day} series={series} />
          <div className="grid grid-cols-[repeat(auto-fit,minmax(min(200px,100%),1fr))] gap-x-10 gap-y-4 lg:pl-11">
            <span className="flex flex-col gap-1 border-t border-rule pt-3">
              <span className="font-medium">
                {accounts.length === 0
                  ? "No accounts yet"
                  : `${counted} of ${plural(accounts.length, "account")} count`}
              </span>
              <span className="text-dim">
                Returns are blended by how much each account holds.
              </span>
            </span>
            <span className="flex flex-col gap-1 border-t border-rule pt-3">
              <span className="font-medium">Deposits never move the line</span>
              <span className="text-dim">
                Money in and out is removed each day.
              </span>
            </span>
          </div>
        </section>
      </main>
    </>
  );
}
