import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BigReturn, Fact, Header, SectionHead, TabBar } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { signedPercent } from "@/lib/format";
import { holdingsPage, type HoldingRow } from "@/lib/full-pages";
import { plural } from "@/lib/format";
import { loadLeague } from "@/server/leagues";
import { myAccounts, myFirstSeen } from "@/server/me";
import { syncStatus } from "@/server/status";
import { requireViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Holdings" };

const SHADES = ["bg-text", "bg-sub", "bg-dim", "bg-grey"];
/** The share bar's scale: its full width is 40% of the portfolio. */
const BAR_FULL = 0.4;
/** The change bar's scale: half its width is a 20% move. */
const CHANGE_FULL = 0.2;

const one = (share: number) => `${(share * 100).toFixed(1)}%`;

function ShareBar({ row, index }: { row: HoldingRow; index: number }) {
  const lit = row.over || row.largest;
  return (
    <span className="relative flex h-3 items-center" aria-hidden="true">
      <span
        className={`hf-grow h-0.5 ${lit ? "bg-text" : "bg-grey"}`}
        style={
          {
            width: `${Math.min(100, (row.share / BAR_FULL) * 100)}%`,
            "--i": index,
          } as React.CSSProperties
        }
      />
      <span className="absolute top-0 left-[62.5%] h-3 w-px bg-grey" />
    </span>
  );
}

function ChangeBar({ change }: { change: number }) {
  const width = Math.min(50, (Math.abs(change) / CHANGE_FULL) * 50);
  return (
    <span className="relative block h-3" aria-hidden="true">
      <span className="absolute top-0 left-1/2 h-3 w-px bg-rule" />
      <span
        className={`absolute top-[5px] h-0.5 ${change >= 0 ? "left-1/2 bg-text" : "right-1/2 bg-grey"}`}
        style={{ width: `${width}%` }}
      />
    </span>
  );
}

const COLS =
  "grid grid-cols-[48px_minmax(0,1fr)_56px] items-center gap-x-3.5 lg:grid-cols-[64px_minmax(0,1.1fr)_minmax(120px,1.6fr)_56px_190px_110px_minmax(0,0.9fr)] lg:gap-x-6";

export default async function HoldingsRoute({
  searchParams,
}: {
  searchParams: Promise<{ account?: string }>;
}) {
  const viewer = await requireViewer();
  const league = await loadLeague(viewer);
  const player = league?.members.find((m) => m.userId === viewer.id);
  if (!player) notFound();
  const [accounts, firstSeen] = await Promise.all([
    myAccounts(viewer),
    myFirstSeen(viewer),
  ]);
  const page = holdingsPage(
    player,
    accounts,
    firstSeen,
    today(),
    (await searchParams).account,
  );
  const status = await syncStatus(viewer);
  const showSince = page.rows.some((r) => r.since);
  const showAccounts = page.rows.some((r) => r.accounts);
  const showNames = page.rows.some((r) => r.name);

  return (
    <>
      <Header
        active="Holdings"
        initial={viewer.name.charAt(0).toUpperCase()}
        status={status}
      />
      <main className="mx-auto flex w-full max-w-[1440px] flex-1 flex-wrap items-start gap-x-14 gap-y-8 px-5 pt-3 pb-28 lg:gap-y-10 lg:px-10 lg:pt-6 lg:pb-10">
        <section className="flex min-w-0 flex-[1_1_250px] flex-col gap-5 lg:gap-8">
          <div className="flex flex-col gap-1 lg:gap-3">
            <span className="label flex items-center gap-2">
              <Icon name="lock" size={12} />
              Only you see this
            </span>
            <h1 className="m-0 text-[28px] leading-[1.05] font-medium tracking-[-0.035em] lg:text-[40px]">
              Holdings
            </h1>
            <span className="text-dim">
              {page.positions === 0
                ? "Nothing to show yet."
                : `${plural(page.positions, "position")} across ${plural(page.countedAccounts, "counted account")}.`}
            </span>
          </div>
          {page.largest && (
            <div className="hf-rise flex flex-col gap-1.5">
              <span className="label">Largest holding · {page.largest.ticker}</span>
              <BigReturn
                text={(page.largest.share * 100).toFixed(1)}
                className="text-[58px] lg:text-[84px]"
                signClassName="text-[28px] lg:text-[40px]"
              />
              <div className="flex flex-col border-b border-faint pt-3.5">
                {page.stats.map((s) => (
                  <Fact key={s.label} {...s} />
                ))}
              </div>
            </div>
          )}
          <p className="m-0 hidden gap-2.5 text-xs text-grey lg:flex">
            <span className="mt-px flex">
              <Icon name="info" size={14} />
            </span>
            Shares of your portfolio and price changes only. Holdfast never
            shows a dollar amount.
          </p>
        </section>
        <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-6 lg:gap-9">
          {page.rows.length === 0 ? (
            <section className="flex flex-col gap-2.5">
              <SectionHead title="Positions" />
              <p className="m-0 border-t border-b border-faint py-3 text-dim">
                {viewer.kind === "demo"
                  ? "The demo portfolio has no positions here."
                  : "No positions yet. They appear after your accounts sync, and only from accounts that count."}{" "}
                <Link
                  href="/settings"
                  className="text-sub underline decoration-rule underline-offset-4"
                >
                  Check your accounts
                </Link>
              </p>
            </section>
          ) : (
            <>
              <section className="flex flex-col gap-3.5">
                <SectionHead title="Split" aside={status} />
                <div
                  className="flex gap-0.5"
                  role="img"
                  aria-label={`Portfolio split by holding. The largest in view is ${page.rows[0].ticker} at ${one(page.rows[0].share)}.`}
                >
                  {page.rows.map((r, i) => (
                    <span
                      key={r.ticker}
                      title={`${r.ticker} ${one(r.share)}`}
                      className={`hf-grow h-2 lg:h-2.5 ${i < 4 ? SHADES[i] : "bg-rule"}`}
                      style={
                        {
                          flex: `${r.share} 1 0`,
                          "--i": i,
                        } as React.CSSProperties
                      }
                    />
                  ))}
                </div>
                <div className="hidden gap-0.5 lg:flex" aria-hidden="true">
                  {page.split.map((s, i) => (
                    <span
                      key={s.label}
                      className="flex min-w-0 flex-col leading-[1.35]"
                      style={{ flex: `${s.share} 1 0` }}
                    >
                      <span
                        className={`truncate font-mono text-xs ${i === 0 ? "text-text" : i < 4 ? "text-sub" : "text-dim"}`}
                      >
                        {s.label}
                      </span>
                      <span className="font-mono text-[11px] text-grey">
                        {one(s.share)}
                      </span>
                    </span>
                  ))}
                </div>
              </section>
              <section className="flex flex-col gap-2.5">
                <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2">
                  {page.filters.length > 0 ? (
                    <div
                      className="-mx-1 flex max-w-full gap-0.5 overflow-x-auto px-1"
                      role="group"
                      aria-label="Accounts"
                    >
                      {page.filters.map((f) => (
                        <Link
                          key={f.key}
                          href={f.key === "all" ? "/holdings" : `/holdings?account=${encodeURIComponent(f.key)}`}
                          scroll={false}
                          aria-current={f.active ? "true" : undefined}
                          className={`flex min-h-8 flex-none items-center rounded-full px-3 text-[12.5px] font-medium transition-colors ${
                            f.active
                              ? "bg-chip text-text"
                              : "text-dim hover:text-text"
                          }`}
                        >
                          {f.label}
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <span className="label">Positions</span>
                  )}
                  <span className="hidden items-center gap-[7px] text-xs text-grey lg:flex">
                    <svg width="1" height="12" viewBox="0 0 1 12" aria-hidden="true">
                      <path d="M0.5 0V12" stroke="#646973" strokeWidth="1" />
                    </svg>
                    25% Well Spread limit
                  </span>
                </div>
                <div className={`${COLS} label hidden !text-grey lg:grid`}>
                  <span>Ticker</span>
                  <span>{showNames ? "Name" : ""}</span>
                  <span className="flex items-center gap-1 !text-dim">
                    Share <Icon name="down" size={11} />
                  </span>
                  <span />
                  <span className="text-right">This quarter</span>
                  <span>{showSince ? "Held since" : ""}</span>
                  <span>{showAccounts ? "Account" : ""}</span>
                </div>
                <ul className="m-0 list-none border-b border-faint p-0">
                  {page.rows.map((r, i) => {
                    const lit = r.over || r.largest;
                    return (
                      <li
                        key={r.ticker}
                        className={`hf-row hf-hover ${COLS} min-h-12 border-t border-faint lg:min-h-[46px]`}
                        style={{ "--i": Math.min(i, 14) } as React.CSSProperties}
                      >
                        <span className="truncate font-mono text-[13px]">
                          {r.ticker}
                        </span>
                        <span className="hidden truncate text-dim lg:block">
                          {r.name}
                        </span>
                        <ShareBar row={r} index={Math.min(i, 14)} />
                        <span className="flex flex-col items-end leading-[1.3]">
                          <span
                            className={`font-mono text-[13px] ${lit ? "text-text" : "text-sub"}`}
                          >
                            {one(r.share)}
                          </span>
                          {r.change !== null && (
                            <span
                              className={`font-mono text-[11px] lg:hidden ${r.change >= 0 ? "text-sub" : "text-grey"}`}
                            >
                              {signedPercent(r.change, 1)}
                            </span>
                          )}
                        </span>
                        {r.change === null ? (
                          <span className="hidden text-right font-mono text-[13px] text-grey lg:block">
                            –
                          </span>
                        ) : (
                          <span className="hidden grid-cols-[104px_62px] items-center justify-end gap-x-3 lg:grid">
                            <ChangeBar change={r.change} />
                            <span
                              className={`text-right font-mono text-[13px] ${r.change >= 0 ? "text-text" : "text-dim"}`}
                            >
                              {signedPercent(r.change, 1)}
                            </span>
                          </span>
                        )}
                        <span className="hidden truncate font-mono text-xs text-dim lg:block">
                          {r.since}
                        </span>
                        <span className="hidden truncate text-xs text-grey lg:block">
                          {r.accounts}
                        </span>
                      </li>
                    );
                  })}
                </ul>
                <p className="m-0 text-xs text-grey">
                  {page.scope === "other"
                    ? "These accounts are left out of leagues. Shares are of those accounts together."
                    : "Shares are of every counted account together. The mark is the 25% Well Spread limit."}
                </p>
              </section>
            </>
          )}
        </div>
      </main>
      <TabBar active="Holdings" />
    </>
  );
}
