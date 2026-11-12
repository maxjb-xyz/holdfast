import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Fact, Header, TabBar } from "@/components/chrome";
import { Crumb, Segments } from "@/components/ui";
import { badgesPage, type BadgeRow } from "@/lib/full-pages";
import { loadLeague } from "@/server/leagues";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Badges" };

const COLS =
  "grid grid-cols-[52px_minmax(0,1fr)] items-center gap-x-4 gap-y-3 lg:grid-cols-[72px_minmax(0,1.2fr)_minmax(0,1fr)_150px_70px] lg:gap-x-8";

const TIMES = ["–", "Once", "Twice"];

function Row({ row, index }: { row: BadgeRow; index: number }) {
  const lit = row.held || row.earnedNow;
  return (
    <li
      className={`hf-row ${COLS} border-t border-faint py-5 lg:min-h-[120px] lg:py-0`}
      style={{ "--i": index * 2 } as React.CSSProperties}
    >
      <span
        aria-hidden="true"
        className={`box-border flex size-[52px] flex-none items-center justify-center rounded-full border text-[14px] tracking-[-0.02em] lg:size-[72px] lg:text-[19px] ${
          lit ? "border-sub text-text" : "border-dashed border-grey text-dim"
        }`}
      >
        {row.mark}
      </span>
      <span className="flex min-w-0 flex-col gap-1">
        <span
          className={`text-[17px] font-medium tracking-[-0.02em] lg:text-xl ${lit ? "text-text" : "text-sub"}`}
        >
          {row.name}
        </span>
        <span className="text-dim">{row.rule}</span>
      </span>
      <span className="col-span-2 flex flex-col gap-2 lg:col-span-1">
        <Segments done={row.done} of={row.of} />
        <span className="font-mono text-[11px] text-sub">{row.standing}</span>
      </span>
      <span
        className="col-span-2 flex items-center justify-between gap-3.5 lg:contents"
        role="img"
        aria-label={`Earned in ${row.times} of the last four quarters`}
      >
        <span className="flex gap-3.5">
          {row.quarters.map((q) => (
            <span key={q.label} className="flex flex-col items-center gap-1.5">
              <span
                className={`box-border size-2.5 rounded-full ${
                  q.earned ? "bg-text" : "border border-grey"
                }`}
              />
              <span
                className={`font-mono text-[10px] ${q.current ? "text-dim" : "text-grey"}`}
              >
                {q.label}
              </span>
            </span>
          ))}
        </span>
        <span
          className={`text-right font-mono text-[13px] ${row.times > 0 ? "text-sub" : "text-grey"}`}
        >
          {TIMES[row.times] ?? `${row.times} times`}
        </span>
      </span>
    </li>
  );
}

export default async function BadgesRoute() {
  const viewer = await requireViewer();
  const league = await loadLeague(viewer);
  const player = league?.members.find((m) => m.userId === viewer.id);
  if (!player) notFound();
  const page = badgesPage(player, today());

  return (
    <>
      <Header
        active="Profile"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={await syncStatus(viewer)}
      />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-start gap-x-14 gap-y-8 px-5 pt-3 pb-28 lg:gap-y-10 lg:px-10 lg:pt-6 lg:pb-10">
        <section className="flex min-w-0 flex-[1_1_250px] flex-col gap-5 lg:gap-8">
          <div className="flex flex-col gap-1 lg:gap-3">
            <Crumb href="/profile" parent="Profile" here="Badges" />
            <h1 className="m-0 text-[28px] leading-[1.05] font-medium tracking-[-0.035em] lg:text-[40px]">
              Badges
            </h1>
            <span className="text-dim">
              Earned for patient habits. Never for trading more.
            </span>
          </div>
          <div className="hf-rise flex flex-col gap-1.5">
            <span className="label">Earned so far</span>
            <span className="numeral text-[58px] lg:text-[84px]">
              {page.total}
            </span>
            <div className="flex flex-col border-b border-faint pt-3.5">
              <Fact label="This quarter" value={`${page.earnedNow} earned`} />
              <Fact
                label="In reach"
                value={page.inReach === 0 ? "None" : `${page.inReach} more`}
                quiet={page.inReach === 0}
              />
              {page.mostEarned && (
                <Fact label="Most earned" value={page.mostEarned} />
              )}
            </div>
          </div>
        </section>
        <section className="flex min-w-0 flex-[999_1_640px] flex-col gap-2.5">
          <div className={`${COLS} label hidden !text-grey lg:grid`}>
            <span />
            <span>Badge</span>
            <span>This quarter</span>
            <span>Past year</span>
            <span className="text-right">Earned</span>
          </div>
          <ul className="m-0 list-none border-b border-faint p-0">
            {page.rows.map((row, i) => (
              <Row key={row.key} row={row} index={i} />
            ))}
          </ul>
          <p className="m-0 text-xs text-grey">
            Badges are awarded on the day the habit is complete. Well Spread is
            judged on the last day of the quarter.
          </p>
        </section>
      </main>
      <TabBar active="Profile" />
    </>
  );
}
