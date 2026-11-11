import Link from "next/link";
import { redirect } from "next/navigation";
import { Wordmark } from "@/components/chrome";
import { Icon, type IconName } from "@/components/icons";
import { MiniChart } from "@/components/league-chart";
import { DEMO_VIEWER_ID, demoLeague } from "@/lib/demo";
import { signedPercent } from "@/lib/format";
import { leaguePage } from "@/lib/pages";
import { addDays } from "@/lib/quarters";
import { startDemo } from "@/server/actions";
import { getViewer, today } from "@/server/viewer";

const NOTICES: Record<string, string> = {
  setup:
    "SnapTrade sign-in is not set up on this deployment yet. The demo league works in the meantime.",
  denied: "Sign-in was cancelled, so nothing was connected.",
  failed: "Sign-in did not complete. Nothing was connected. Please try again.",
  full: "This preview can only hold five SnapTrade users, and it is full. The demo league is open to everyone.",
  deleted: "Your data has been deleted and your SnapTrade access revoked.",
  "deleted-check":
    "Your data has been deleted. SnapTrade did not confirm that access was revoked, so please also remove Holdfast in your SnapTrade settings.",
};

const FACTS: { icon: IconName; title: string; text: string }[] = [
  {
    icon: "lock",
    title: "Read-only",
    text: "Holdfast can never place a trade.",
  },
  {
    icon: "chart",
    title: "Deposits never count",
    text: "Scores use return with money in and out removed.",
  },
  {
    icon: "award",
    title: "Patience earns badges",
    text: "Hold for a year. Buy every month. Stay spread out.",
  },
];

export default async function SignIn({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  if (await getViewer()) redirect("/league");
  const notice = NOTICES[(await searchParams).notice ?? ""];
  const day = today();
  const page = leaguePage(demoLeague(day), DEMO_VIEWER_ID, day);
  const you = page.you?.score.value ?? null;

  return (
    <>
      <header className="flex items-center justify-between px-5 pt-1.5 lg:px-10 lg:py-3.5">
        <Wordmark href="/" />
        <Link
          href="/how-it-works"
          className="hover-text flex min-h-11 items-center font-medium text-dim"
        >
          How it works
        </Link>
      </header>
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-col justify-between gap-12 px-5 pt-6 pb-10 lg:px-10">
        <div className="flex flex-1 flex-wrap items-center gap-x-[72px] gap-y-12">
          <section className="flex min-w-0 flex-[1_1_420px] flex-col gap-7">
            {notice && (
              <p
                role="status"
                className="m-0 flex max-w-[52ch] items-start gap-3 border-t border-b border-rule py-3 text-sub"
              >
                <span className="mt-0.5 flex text-dim">
                  <Icon name="info" />
                </span>
                {notice}
              </p>
            )}
            <h1 className="serif m-0 text-[clamp(56px,7vw,96px)] leading-[0.98] !tracking-[-0.03em]">
              Win by waiting.
            </h1>
            <p className="m-0 max-w-[44ch] text-[17px] text-sub">
              A quarterly league for long-term investors. Compete with friends
              on percentage return and steady habits. Nobody sees a dollar
              amount.
            </p>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-3">
              <a
                href="/api/auth/start"
                className="flex min-h-12 items-center gap-2.5 rounded-full bg-text px-[22px] text-[15px] font-semibold text-bg transition-colors hover:bg-white"
              >
                Continue with SnapTrade
                <Icon name="arrow" size={16} stroke={1.8} />
              </a>
              <form action={startDemo}>
                <button
                  type="submit"
                  className="hover-text flex min-h-11 cursor-pointer items-center border-0 bg-transparent p-0 text-sm font-medium text-sub underline decoration-rule underline-offset-4"
                >
                  Explore the demo league
                </button>
              </form>
            </div>
          </section>
          <section
            className="flex min-w-0 flex-[1_1_480px] flex-col gap-3"
            aria-hidden="true"
          >
            <MiniChart
              rows={page.rows}
              asOf={page.asOf}
              origin={addDays(page.quarter.start, -1)}
              width={560}
              height={330}
              ghost
            />
            {you !== null && (
              <div className="flex justify-end font-mono text-[11px] tracking-[0.08em] text-you">
                YOU {signedPercent(you)}
              </div>
            )}
          </section>
        </div>
        <div className="grid grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-x-14 gap-y-6">
          {FACTS.map((f) => (
            <div
              key={f.title}
              className="flex flex-col gap-1.5 border-t border-rule pt-3.5"
            >
              <span className="flex items-center gap-2 font-medium">
                <span className="flex text-dim">
                  <Icon name={f.icon} />
                </span>
                {f.title}
              </span>
              <span className="text-dim">{f.text}</span>
            </div>
          ))}
        </div>
      </main>
    </>
  );
}
