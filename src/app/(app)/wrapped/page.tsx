import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Header, TabBar } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { quarterLabel, shortDate, signedPercent } from "@/lib/format";
import { wrapped } from "@/lib/pages";
import { addDays, quarterOf, quartersEndingAt } from "@/lib/quarters";
import { loadLeague } from "@/server/leagues";
import { syncStatus } from "@/server/status";
import { getViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Wrapped" };

export default async function WrappedIndex() {
  const viewer = (await getViewer())!;
  const league = await loadLeague(viewer);
  if (!league) notFound();
  const day = today();
  const current = quarterOf(day);
  const past = quartersEndingAt(current, 5)
    .slice(0, -1)
    .reverse()
    .map((q) => wrapped(league, viewer.id, q, day))
    .filter((w) => w !== null);
  const latest = past[0];

  return (
    <>
      <Header
        active="Wrapped"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <main className="mx-auto flex w-full max-w-[720px] flex-1 flex-col gap-10 px-5 pt-3 pb-28 lg:px-10 lg:pt-10 lg:pb-10">
        <div className="flex flex-col gap-3">
          <span className="label">{league.name}</span>
          <h1 className="serif m-0 text-[32px] leading-[1.05] lg:text-[40px]">
            Quarterly Wrapped
          </h1>
          <p className="m-0 max-w-[52ch] text-[15px] text-sub">
            Six cards at the end of every quarter: your return, growth against
            money added, standout holdings, dividends, your style and a card to
            share. Percentages only.
          </p>
        </div>

        {latest ? (
          <Link
            href={`/wrapped/${latest.quarter.key}`}
            className="group flex flex-col gap-5 border-t border-b border-rule py-6 lg:flex-row lg:items-end lg:justify-between"
          >
            <span className="flex flex-col gap-2">
              <span className="label !text-you">
                {quarterLabel(latest.quarter.key)} · ready
              </span>
              <span className="numeral text-[72px] lg:text-[84px]">
                {signedPercent(latest.value).slice(0, -1)}
                <span className="text-[34px] tracking-normal text-dim lg:text-[40px]">
                  %
                </span>
              </span>
              <span className="text-dim">
                {latest.finish
                  ? `${latest.finish} in ${latest.leagueName}`
                  : latest.leagueName}
              </span>
            </span>
            <span className="flex min-h-12 items-center gap-2 self-start rounded-full bg-text px-[22px] text-sm font-semibold text-bg transition-colors group-hover:bg-white lg:self-auto">
              Open
              <Icon name="arrow" size={16} stroke={1.8} />
            </span>
          </Link>
        ) : (
          <p className="m-0 border-t border-b border-rule py-6 text-[15px] text-sub">
            Your first Wrapped arrives on {shortDate(addDays(current.end, 1))},
            the day after {quarterLabel(current.key)} ends.
          </p>
        )}

        <section className="flex flex-col gap-2.5">
          <h2 className="label m-0 font-normal">All quarters</h2>
          <ul className="m-0 list-none border-b border-faint p-0">
            <li className="flex min-h-12 items-center gap-4 border-t border-faint text-dim">
              <span className="w-20 font-mono text-[13px]">
                {quarterLabel(current.key)}
              </span>
              <span className="flex-1">
                In play. Arrives {shortDate(addDays(current.end, 1))}
              </span>
            </li>
            {past.map((w) => (
              <li key={w.quarter.key} className="border-t border-faint">
                <Link
                  href={`/wrapped/${w.quarter.key}`}
                  className="hover-text flex min-h-12 items-center gap-4"
                >
                  <span className="w-20 font-mono text-[13px]">
                    {quarterLabel(w.quarter.key)}
                  </span>
                  <span className="flex-1 text-dim">
                    {w.finish ?? "Unranked"}
                  </span>
                  <span className="font-mono text-[13px]">
                    {signedPercent(w.value)}
                  </span>
                  <span className="flex text-grey">
                    <Icon name="right" size={14} />
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <TabBar active="Wrapped" />
    </>
  );
}
