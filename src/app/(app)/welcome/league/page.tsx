import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/icons";
import { StartPicker } from "@/components/start-picker";
import {
  BareHeader,
  Notice,
  Stepper,
  field,
  outline,
  quiet,
  solid,
} from "@/components/ui";
import { shortDate } from "@/lib/format";
import { LEAGUE_NAME_MAX } from "@/lib/inputs";
import { MAX_LEAGUE_MEMBERS } from "@/lib/model";
import { addDays, quarterOf } from "@/lib/quarters";
import {
  createLeagueAction,
  leave,
  openInviteAction,
  skipWelcomeAction,
} from "@/server/actions";
import { MAX_LEAGUES_PER_PERSON } from "@/server/league-admin";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Find your league" };

const NOTICES: Record<string, string> = {
  name: "Give the league a name first.",
  "too-many": `You can be in up to ${MAX_LEAGUES_PER_PERSON} leagues at a time.`,
  "not-found": "That invite link or code does not match a league.",
};

function Choice({
  label,
  title,
  text,
  index,
  children,
}: {
  label: string;
  title: string;
  text: string;
  index: number;
  children: React.ReactNode;
}) {
  return (
    <section
      className="hf-row flex min-w-0 flex-col gap-3.5 border-t border-rule pt-[18px]"
      style={{ "--i": index * 2 } as React.CSSProperties}
    >
      <span className="label">{label}</span>
      <h2 className="m-0 text-[22px] font-medium tracking-[-0.02em]">{title}</h2>
      <p className="m-0 max-w-[40ch] text-dim">{text}</p>
      {children}
    </section>
  );
}

export default async function WelcomeLeagueRoute({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  const viewer = await requireViewer();
  if (viewer.kind !== "user") redirect("/league");
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const quarter = quarterOf(day);

  return (
    <>
      <BareHeader>
        <form action={leave}>
          <button type="submit" className={`${quiet} font-medium`}>
            Sign out
          </button>
        </form>
      </BareHeader>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col gap-11 px-5 pt-6 pb-16 lg:px-10 lg:pb-10">
        <div className="flex max-w-[520px] flex-col gap-8">
          <Stepper active={2} />
          <div className="hf-rise flex flex-col gap-3">
            <span className="label">Last step</span>
            <h1 className="serif m-0 text-[32px] leading-[1.05] lg:text-[48px]">
              Find your league.
            </h1>
            <p className="m-0 max-w-[44ch] text-[15px] text-sub">
              A league is up to {MAX_LEAGUE_MEMBERS === 8 ? "eight" : MAX_LEAGUE_MEMBERS}{" "}
              friends on one chart, scored on percentage return for the
              quarter.
            </p>
          </div>
          <Notice>{notice}</Notice>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-start gap-x-14 gap-y-10">
          <Choice
            index={0}
            label="Start one"
            title="Make a league"
            text="Name it, then send one link. Friends join with their own SnapTrade sign-in."
          >
            <form action={createLeagueAction} className="flex flex-col gap-3.5">
              <input type="hidden" name="back" value="/welcome/league" />
              <div className="flex flex-wrap gap-3">
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
                  Create league
                  <Icon name="arrow" size={15} stroke={1.8} />
                </button>
              </div>
              <StartPicker
                compact
                quarterStart={quarter.start}
                quarterStartLabel={shortDate(quarter.start)}
                todayLabel={shortDate(day)}
                earliest={addDays(day, -365)}
                latest={addDays(day, -1)}
              />
            </form>
          </Choice>
          <Choice
            index={1}
            label="Got a link"
            title="Join a league"
            text="Paste the invite link or code a friend sent you."
          >
            <form action={openInviteAction} className="flex flex-wrap gap-3">
              <input type="hidden" name="back" value="/welcome/league" />
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
                Open invite
              </button>
            </form>
            <span className="text-xs text-grey">
              You see the league name and size before you join.
            </span>
          </Choice>
          <Choice
            index={2}
            label="Not yet"
            title="Look around first"
            text="The demo league has made-up rivals and a full quarter of history. Your real league can wait."
          >
            <form action={skipWelcomeAction}>
              <button type="submit" className={`${quiet} !text-text`}>
                Open the demo league
                <Icon name="arrow" size={15} />
              </button>
            </form>
          </Choice>
        </div>
        <Link href="/welcome" className={`${quiet} self-start`}>
          <Icon name="left" size={15} />
          Back to accounts
        </Link>
      </main>
    </>
  );
}
