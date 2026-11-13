import Link from "next/link";
import { Fact, Header, SectionHead, TabBar } from "@/components/chrome";
import { Icon } from "@/components/icons";
import {
  CareerChart,
  HoldingBars,
  Ladder,
  Medal,
  Rhythm,
  Switch,
} from "@/components/profile-parts";
import { signedNumber, signedPercent } from "@/lib/format";
import type { ProfilePage } from "@/lib/pages";
import { leave, toggleAccount, togglePrivacy } from "@/server/actions";

function Private({ what }: { what: string }) {
  return (
    <p className="m-0 flex items-center gap-2 border-t border-b border-faint py-3 text-dim">
      <Icon name="lock" size={14} />
      {what} are private.
    </p>
  );
}

function Badges({
  page,
  size,
  short,
}: {
  page: ProfilePage;
  size: number;
  short?: boolean;
}) {
  if (!page.badges) return <Private what="Badges" />;
  return (
    <>
      {page.badges.map((b) => (
        <Medal key={b.key} badge={b} size={size} short={short} />
      ))}
    </>
  );
}

function Settings({ page, isDemo }: { page: ProfilePage; isDemo: boolean }) {
  if (!page.accounts || !page.privacy) return null;
  const counted = page.accounts.filter((a) => a.counted).length;
  return (
    <>
      <section className="flex flex-col gap-2.5" id="settings">
        <SectionHead
          title="Accounts in leagues"
          aside={
            <>
              <Icon name="lock" size={12} />
              Read-only
            </>
          }
        />
        {page.accounts.length === 0 ? (
          <p className="m-0 border-t border-b border-faint py-3 text-dim">
            No accounts yet. They appear here after your first sync with
            SnapTrade.
          </p>
        ) : (
          <div className="border-b border-faint">
            {page.accounts.map((a) => (
              <Switch
                key={a.id}
                label={a.label}
                hint={
                  !a.connected
                    ? "Link dropped, reconnect to resume"
                    : a.counted
                      ? "Connected"
                      : "Left out of leagues"
                }
                on={a.counted}
                action={toggleAccount}
                fields={{ accountId: a.id }}
                disabled={a.counted && counted === 1}
              />
            ))}
          </div>
        )}
      </section>
      <section className="flex flex-col gap-2.5">
        <SectionHead title="Friends can see" />
        <div className="border-b border-faint">
          <Switch
            label="Return history"
            hint="On your profile. Never dollars"
            on={page.privacy.showReturn}
            action={togglePrivacy}
            fields={{ field: "showReturn" }}
          />
          <Switch
            label="Badges and habits"
            hint="With dates"
            on={page.privacy.showBadges}
            action={togglePrivacy}
            fields={{ field: "showBadges" }}
          />
          <Switch
            label="Best and worst holding"
            hint="Ticker and percentage"
            on={page.privacy.showHoldings}
            action={togglePrivacy}
            fields={{ field: "showHoldings" }}
          />
        </div>
        <p className="m-0 text-xs text-grey">
          League standings always show your percentage return. Dollar amounts
          are never shown to anyone.
        </p>
      </section>
      <section className="flex flex-col gap-1">
        <form action={leave}>
          <button
            type="submit"
            className="hover-text flex min-h-11 cursor-pointer items-center gap-2 border-0 bg-transparent p-0 font-medium text-sub"
          >
            {isDemo ? "Exit the demo" : "Sign out"}
            <Icon name="arrow" size={15} />
          </button>
        </form>
        {!isDemo && (
          <Link
            href="/settings"
            className="hover-text flex min-h-11 items-center gap-2 text-dim"
          >
            All settings and your data
            <Icon name="right" size={14} />
          </Link>
        )}
      </section>
    </>
  );
}

function More({ href, children }: { href: string; children: string }) {
  return (
    <Link
      href={href}
      className="hover-text -my-2 flex min-h-9 items-center gap-1.5 self-start text-[13px] text-dim"
    >
      {children}
      <Icon name="arrow" size={14} />
    </Link>
  );
}

function BestWorst({ page }: { page: ProfilePage }) {
  if (!page.bestWorst) return null;
  const { best, worst } = page.bestWorst;
  return (
    <section className="flex flex-col gap-2.5">
      <SectionHead title={page.bestWorst.heading} />
      <div className="border-b border-faint">
        <Fact
          label="Best"
          value={`${best.ticker} ${signedPercent(best.change as number, 1)}`}
        />
        {worst && worst.ticker !== best.ticker && (
          <Fact
            label="Worst"
            value={`${worst.ticker} ${signedPercent(worst.change as number, 1)}`}
          />
        )}
      </div>
    </section>
  );
}

export function ProfileView({
  page,
  viewerInitial,
  status,
  isDemo,
  backHref,
}: {
  page: ProfilePage;
  viewerInitial: string;
  status: string;
  isDemo: boolean;
  backHref: string;
}) {
  const title = page.name === "You" ? "Your profile" : page.name;
  const thisQuarter = page.stats.find((s) => s.label === "This quarter")?.value;
  const bestFinish = page.stats
    .find((s) => s.label === "Best finish")
    ?.value.split(",")[0];
  const boughtCount = page.rhythm?.filter((m) => m.bought).length ?? 0;
  const wrappedHref = page.wrappedQuarter
    ? `/wrapped/${page.wrappedQuarter.key}`
    : null;
  const wrappedLabel = page.wrappedQuarter
    ? `Open ${page.wrappedQuarter.key.split("-")[1]} Wrapped`
    : null;

  return (
    <>
      <Header
        active={page.isSelf ? "Profile" : null}
        initial={viewerInitial}
        status={status}
      />

      {/* Desktop */}
      <main className="mx-auto hidden w-full max-w-[1440px] flex-1 flex-wrap content-start items-start gap-x-14 gap-y-12 px-10 pt-6 pb-10 lg:flex xl:flex-nowrap">
        <section className="rise flex min-w-0 flex-[1_1_250px] flex-col gap-8">
          {!page.isSelf && (
            <Link
              href={backHref}
              className="hover-text -mb-4 flex min-h-11 items-center gap-1.5 text-dim"
            >
              <Icon name="left" size={14} />
              {page.leagueName}
            </Link>
          )}
          <div className="flex flex-col gap-3">
            <span className="label">{page.style}</span>
            <h1 className="m-0 text-[40px] leading-[1.05] font-medium tracking-[-0.035em]">
              {title}
            </h1>
            <span className="text-dim">Playing since {page.sinceLabel}.</span>
          </div>
          <div className="flex flex-col border-b border-faint">
            {page.stats.map((s) => (
              <Fact key={s.label} {...s} />
            ))}
          </div>
          {wrappedHref && (
            <Link
              href={wrappedHref}
              className="hover-text flex min-h-11 items-center gap-2"
            >
              {wrappedLabel}
              <Icon name="arrow" size={15} />
            </Link>
          )}
        </section>

        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-11">
          <section
            className="rise flex flex-col gap-[18px]"
            style={{ "--i": 1.5 } as React.CSSProperties}
          >
            <SectionHead
              title="Return by quarter"
              aside="Each quarter starts at 0%"
            />
            {page.career ? (
              <CareerChart quarters={page.career} width={720} height={340} />
            ) : (
              <Private what="Past returns" />
            )}
          </section>
          <div
            className="rise grid grid-cols-3 gap-x-12 gap-y-10"
            style={{ "--i": 4 } as React.CSSProperties}
          >
            <section className="flex flex-col gap-[18px]">
              <SectionHead
                title="Buying rhythm"
                aside={page.rhythm ? `${boughtCount} of 12` : undefined}
              />
              {page.rhythm ? (
                <>
                  <Rhythm months={page.rhythm} size={13} />
                  <span className="text-xs text-grey">
                    Months with a buy. Streak of {page.streak}.
                  </span>
                </>
              ) : (
                <Private what="Habits" />
              )}
            </section>
            <section className="flex flex-col gap-[18px]">
              <SectionHead title="Finish" aside="Top is 1st" />
              {page.career ? (
                <Ladder quarters={page.career} />
              ) : (
                <Private what="Past finishes" />
              )}
            </section>
            {page.holdings ? (
              <section className="flex flex-col gap-2.5">
                <SectionHead
                  title="Holdings"
                  aside={
                    <>
                      <Icon name="lock" size={12} />
                      Only you
                    </>
                  }
                />
                {page.holdings.length > 0 ? (
                  <>
                    <HoldingBars holdings={page.holdings} />
                    <span className="text-xs text-grey">
                      {page.holdingsNote ? `${page.holdingsNote} ` : ""}Mark at
                      25%, the Well Spread limit.
                    </span>
                    <More href="/holdings">All holdings</More>
                  </>
                ) : (
                  <p className="m-0 text-xs text-grey">
                    Holdings appear after your first sync.
                  </p>
                )}
              </section>
            ) : (
              <BestWorst page={page} />
            )}
          </div>
        </div>

        <aside
          className="rise grid min-w-0 basis-full grid-cols-3 items-start gap-x-12 gap-y-9 xl:flex xl:flex-[1_1_290px] xl:flex-col xl:items-stretch"
          style={{ "--i": 3 } as React.CSSProperties}
        >
          <section className="flex flex-col gap-4">
            <SectionHead
              title="Badges"
              aside={page.badges ? `${page.badgeCount} of 4` : undefined}
            />
            <div className="flex flex-col gap-3.5">
              <Badges page={page} size={52} />
            </div>
            {page.isSelf && <More href="/badges">Badge progress</More>}
          </section>
          <Settings page={page} isDemo={isDemo} />
        </aside>
      </main>

      {/* Phone */}
      <main className="rise mx-auto flex w-full max-w-[560px] flex-1 flex-col gap-4 px-5 pt-3 pb-28 lg:hidden">
        {!page.isSelf && (
          <Link
            href={backHref}
            className="hover-text -mb-2 flex min-h-11 items-center gap-1.5 text-dim"
          >
            <Icon name="left" size={14} />
            {page.leagueName}
          </Link>
        )}
        <div className="flex flex-col gap-1">
          <span className="label !text-[10px]">
            {page.style} · since {page.sinceLabel}
          </span>
          <h1 className="m-0 text-[28px] leading-[1.1] font-medium tracking-[-0.035em]">
            {title}
          </h1>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {[
            ["Quarter", thisQuarter ?? "–"],
            ["Best finish", bestFinish ?? "–"],
            ["Buy streak", page.rhythm ? `${page.streak} mo` : "–"],
          ].map(([k, v]) => (
            <div key={k} className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-[0.08em] text-grey uppercase">
                {k}
              </span>
              <span className="text-[17px] font-medium tracking-[-0.02em]">
                {v}
              </span>
            </div>
          ))}
        </div>
        {page.career ? (
          <section className="flex flex-col gap-2">
            <div className="-mx-5">
              <CareerChart
                quarters={page.career}
                width={390}
                height={120}
                compact
              />
            </div>
            <div className="grid grid-cols-4 font-mono text-[11px] text-dim">
              {page.career.slice(-4).map((q) => (
                <span
                  key={q.quarter.key}
                  className={q.current ? "text-you" : ""}
                >
                  {q.quarter.key.split("-")[1]}{" "}
                  {q.value === null ? "–" : signedNumber(q.value)}
                </span>
              ))}
            </div>
          </section>
        ) : (
          <Private what="Past returns" />
        )}
        {page.rhythm && (
          <section className="flex flex-col gap-3 border-t border-faint pt-3.5">
            <SectionHead
              title="Buying rhythm"
              aside={`${boughtCount} of 12 months`}
            />
            <Rhythm months={page.rhythm} size={14} />
          </section>
        )}
        <section className="flex flex-col gap-3.5 border-t border-faint pt-3.5">
          <SectionHead
            title="Badges"
            aside={page.badges ? `${page.badgeCount} of 4` : undefined}
          />
          <div className="grid grid-cols-2 gap-x-3 gap-y-3.5">
            <Badges page={page} size={40} short />
          </div>
          {page.isSelf && <More href="/badges">Badge progress</More>}
        </section>
        {wrappedHref && (
          <Link
            href={wrappedHref}
            className="flex min-h-[52px] items-center gap-3 border-t border-faint"
          >
            <span className="flex text-dim">
              <Icon name="spark" size={17} />
            </span>
            <span className="flex-1 font-medium">{wrappedLabel}</span>
            <span className="flex text-grey">
              <Icon name="right" size={16} />
            </span>
          </Link>
        )}
        {page.holdings && page.holdings.length > 0 && (
          <section className="flex flex-col gap-2.5 border-t border-faint pt-3.5">
            <SectionHead
              title="Holdings"
              aside={
                <>
                  <Icon name="lock" size={12} />
                  Only you
                </>
              }
            />
            <HoldingBars holdings={page.holdings} />
            <span className="text-xs text-grey">
              {page.holdingsNote ? `${page.holdingsNote} ` : ""}Mark at 25%, the
              Well Spread limit.
            </span>
            <More href="/holdings">All holdings</More>
          </section>
        )}
        <BestWorst page={page} />
        {page.isSelf && (
          <div className="mt-2 flex flex-col gap-8">
            <Settings page={page} isDemo={isDemo} />
          </div>
        )}
      </main>
      <TabBar active={page.isSelf ? "Profile" : null} />
    </>
  );
}
