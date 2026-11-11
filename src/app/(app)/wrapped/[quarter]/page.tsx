import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { BigReturn } from "@/components/chrome";
import { Icon } from "@/components/icons";
import { MiniChart } from "@/components/league-chart";
import { KeyNav, ShareActions } from "@/components/share-actions";
import { ShareCardSvg } from "@/components/share-card";
import { BADGES } from "@/lib/badges";
import {
  monthName,
  plural,
  quarterLabel,
  shortDate,
  signedNumber,
  signedPercent,
} from "@/lib/format";
import { wrapped, type LeaguePageRow, type Wrapped } from "@/lib/pages";
import { addDays, quarterOf } from "@/lib/quarters";
import { shareCard } from "@/lib/share";
import { loadLeague } from "@/server/leagues";
import { shareToken } from "@/server/share-token";
import { getViewer, today } from "@/server/viewer";

export const metadata: Metadata = { title: "Wrapped" };

const CARDS = 6;

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-mono text-[10px] tracking-[0.08em] text-grey uppercase">
        {label}
      </span>
      <span className="text-[17px] font-medium tracking-[-0.02em]">
        {value}
      </span>
    </div>
  );
}

function Headline({ children }: { children: React.ReactNode }) {
  return <h1 className="serif m-0 text-[26px] leading-[1.1]">{children}</h1>;
}

function CardOne({ w }: { w: Wrapped }) {
  // The quarter's line, drawn with the same chart the league uses.
  const row = {
    userId: "you",
    isYou: true,
    paused: false,
    joinedThisQuarter: false,
    joinedOn: "",
    chart: w.series,
  } as unknown as LeaguePageRow;
  return (
    <>
      <div className="flex flex-col gap-3">
        <Headline>
          {w.value >= 0 ? "Your quarter grew" : "Your quarter dipped"}
        </Headline>
        <BigReturn
          text={signedNumber(w.value)}
          className="text-[108px] !leading-[0.88] !tracking-[-0.06em]"
          signClassName="text-[46px]"
        />
        {w.partial && (
          <span className="text-xs text-grey">
            Partial: some days had incomplete brokerage data.
          </span>
        )}
      </div>
      <div className="flex flex-col gap-2.5">
        <div className="-mx-5">
          <MiniChart
            rows={[row]}
            asOf={w.quarter.end}
            origin={addDays(w.quarter.start, -1)}
            height={170}
            label="Your return across the quarter"
          />
        </div>
        <div className="label flex justify-between !text-[10px] !text-grey">
          <span>{shortDate(w.quarter.start)}</span>
          <span>{shortDate(w.quarter.end)}</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 border-t border-faint py-3.5">
        <Stat label="Finish" value={w.finish ?? "Unranked"} />
        <Stat
          label="Best week"
          value={w.bestWeek === null ? "–" : signedPercent(w.bestWeek)}
        />
        <Stat
          label="Badges"
          value={
            w.newBadges.length > 0 ? `${w.newBadges.length} new` : "None new"
          }
        />
      </div>
    </>
  );
}

function CardTwo({ w }: { w: Wrapped }) {
  const total = w.growth + w.added;
  const parts = [
    {
      label: "From the market",
      value: w.growth,
      tone: "bg-you",
      note: "This is your league score.",
    },
    {
      label: "From money you added",
      value: w.added,
      tone: "bg-grey",
      note: "Deposits minus withdrawals. It never counts.",
    },
  ];
  const scale = Math.max(Math.abs(w.growth), Math.abs(w.added), 0.0001);
  return (
    <>
      <div className="flex flex-col gap-3">
        <Headline>Growth, not deposits</Headline>
        <p className="m-0 max-w-[30ch] text-[15px] text-sub">
          Your account changed by about {signedPercent(total, 1)} this quarter.
          Only part of that was investing.
        </p>
      </div>
      <div className="flex flex-col gap-7">
        {parts.map((p) => (
          <div key={p.label} className="flex flex-col gap-2.5">
            <div className="flex items-baseline justify-between gap-4">
              <span className="text-dim">{p.label}</span>
              <span className="text-[34px] leading-none font-normal tracking-[-0.04em]">
                {signedPercent(p.value)}
              </span>
            </div>
            <span className="h-0.5 w-full bg-faint" aria-hidden="true">
              <span
                className={`block h-0.5 ${p.tone}`}
                style={{
                  width: `${Math.max(2, (Math.abs(p.value) / scale) * 100)}%`,
                }}
              />
            </span>
            <span className="text-xs text-grey">{p.note}</span>
          </div>
        ))}
      </div>
      <p className="m-0 border-t border-faint pt-3.5 text-xs text-grey">
        Both figures are percentages of your account. Holdfast does not keep the
        dollar amounts behind them.
      </p>
    </>
  );
}

function CardThree({ w }: { w: Wrapped }) {
  const rows = [
    { label: "Best holding", h: w.best },
    {
      label: "Hardest quarter",
      h: w.worst && w.worst.ticker !== w.best?.ticker ? w.worst : null,
    },
  ].filter((r) => r.h);
  return (
    <>
      <Headline>Your standouts</Headline>
      {rows.length === 0 ? (
        <p className="m-0 text-[15px] text-sub">
          Your brokerage did not share holdings for this quarter, so there is
          nothing to single out.
        </p>
      ) : (
        <div className="flex flex-col gap-9">
          {rows.map(({ label, h }) => (
            <div key={label} className="flex flex-col gap-2">
              <span className="label !text-[10px]">{label}</span>
              <div className="flex items-end justify-between gap-4">
                <span className="text-[64px] leading-[0.9] font-normal tracking-[-0.05em]">
                  {h!.ticker}
                </span>
                <span className="pb-1 font-mono text-lg">
                  {signedPercent(h!.change as number, 1)}
                </span>
              </div>
              <span className="text-xs text-grey">
                {Math.round(h!.share * 100)}% of your portfolio
              </span>
            </div>
          ))}
        </div>
      )}
      <p className="m-0 border-t border-faint pt-3.5 text-xs text-grey">
        Price change over the quarter. Friends only see this if you turn it on.
      </p>
    </>
  );
}

function CardFour({ w }: { w: Wrapped }) {
  const start = Number(w.quarter.start.slice(5, 7));
  const year = w.quarter.start.slice(0, 4);
  const months = [0, 1, 2].map(
    (i) => `${year}-${String(start + i).padStart(2, "0")}`,
  );
  return (
    <>
      <div className="flex flex-col gap-3">
        <Headline>Paid to wait</Headline>
        <span className="numeral text-[108px] !leading-[0.88]">
          {w.dividends}
        </span>
        <span className="text-[15px] text-sub">
          {w.dividends === 0
            ? "No dividends landed this quarter."
            : `${plural(w.dividends, "dividend")} received across ${plural(w.dividendMonths.length, "month")}.`}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-3" aria-hidden="true">
        {months.map((m) => (
          <span key={m} className="flex flex-col gap-2.5">
            <span
              className={`h-0.5 ${w.dividendMonths.includes(m) ? "bg-text" : "bg-rule"}`}
            />
            <span className="font-mono text-[11px] tracking-[0.08em] text-grey uppercase">
              {monthName(m)}
            </span>
          </span>
        ))}
      </div>
      <p className="m-0 border-t border-faint pt-3.5 text-xs text-grey">
        Three in one quarter earns Dividend Collector. Dividends count toward
        your return.
      </p>
    </>
  );
}

function CardFive({ w }: { w: Wrapped }) {
  return (
    <>
      <div className="flex flex-col gap-3">
        <Headline>Your style this quarter</Headline>
        <span className="text-[52px] leading-none font-medium tracking-[-0.04em]">
          {w.style}
        </span>
      </div>
      <div className="flex flex-col border-b border-faint">
        {[
          ["Months with a buy", `${w.buyMonths} of 3`],
          [
            "Longest hold",
            w.heldMonths > 0 ? plural(w.heldMonths, "month") : "Just started",
          ],
          ["Dividends", String(w.dividends)],
        ].map(([k, v]) => (
          <div
            key={k}
            className="flex items-baseline justify-between gap-4 border-t border-faint py-[11px]"
          >
            <span className="text-dim">{k}</span>
            <span className="font-mono text-[13px]">{v}</span>
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-3">
        <span className="label !text-[10px]">Badges earned</span>
        {w.newBadges.length === 0 ? (
          <span className="text-dim">
            None this quarter. They come from habits, so there is always next
            quarter.
          </span>
        ) : (
          <div className="flex flex-wrap gap-x-5 gap-y-3">
            {w.newBadges.map((key) => (
              <span key={key} className="flex items-center gap-2.5">
                <span
                  className="flex size-10 items-center justify-center rounded-full border border-sub text-[11px] tracking-[-0.02em]"
                  aria-hidden="true"
                >
                  {BADGES[key].mark}
                </span>
                <span className="font-medium">{BADGES[key].short}</span>
              </span>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default async function WrappedStory({
  params,
  searchParams,
}: {
  params: Promise<{ quarter: string }>;
  searchParams: Promise<{ card?: string; league?: string }>;
}) {
  const { quarter: key } = await params;
  const { card: cardParam, league: leagueId } = await searchParams;
  const match = /^(\d{4})-Q([1-4])$/.exec(key);
  if (!match) notFound();
  const quarter = quarterOf(
    `${match[1]}-${String((Number(match[2]) - 1) * 3 + 1).padStart(2, "0")}-01`,
  );
  const viewer = (await getViewer())!;
  const league = await loadLeague(viewer, leagueId);
  const w = league && wrapped(league, viewer.id, quarter, today());
  if (!w) notFound();

  const card = Math.min(CARDS, Math.max(1, Number(cardParam) || 1));
  const link = (n: number) =>
    `/wrapped/${key}?card=${n}${leagueId ? `&league=${leagueId}` : ""}`;
  const prev = card > 1 ? link(card - 1) : null;
  const next = card < CARDS ? link(card + 1) : null;
  const displayName =
    viewer.kind === "demo" ? "Demo investor" : viewer.name.split(" ")[0];
  const share = card === CARDS ? shareCard(w, displayName) : null;

  return (
    <main className="mx-auto flex w-full max-w-[430px] flex-1 flex-col justify-between gap-4 px-5 pt-4 pb-6 lg:my-6 lg:min-h-[780px] lg:flex-none lg:rounded-[28px] lg:border lg:border-faint">
      <KeyNav prev={prev} next={next} />
      <div className="flex flex-col gap-2">
        <div
          className="grid grid-cols-6 gap-1"
          role="img"
          aria-label={`Card ${card} of ${CARDS}`}
        >
          {Array.from({ length: CARDS }, (_, i) => (
            <span
              key={i}
              className={`h-0.5 ${i < card ? "bg-text" : "bg-rule"}`}
            />
          ))}
        </div>
        <div className="flex min-h-11 items-center justify-between">
          <span className="label !text-[10px]">
            {quarterLabel(key)} Wrapped
          </span>
          <Link
            href="/wrapped"
            className="label hover-text flex min-h-11 items-center !text-[10px] !text-sub"
          >
            Close
          </Link>
        </div>
      </div>

      {card === 1 && <CardOne w={w} />}
      {card === 2 && <CardTwo w={w} />}
      {card === 3 && <CardThree w={w} />}
      {card === 4 && <CardFour w={w} />}
      {card === 5 && <CardFive w={w} />}
      {share && (
        <>
          <ShareCardSvg card={share} id="share-card" />
          <div className="flex flex-col gap-3">
            <ShareActions
              svgId="share-card"
              fileName={`holdfast-${key}.png`}
              sharePath={`/share/${await shareToken(share)}`}
            />
            <p className="m-0 text-center text-xs text-grey">
              This card shows percentages and badges. It has no dollar amounts.
            </p>
          </div>
        </>
      )}

      <div className="flex items-center justify-between gap-4">
        {prev ? (
          <Link
            href={prev}
            aria-label="Previous card"
            className="hover-text flex size-12 items-center justify-center rounded-full border border-rule text-sub"
          >
            <Icon name="left" size={18} />
          </Link>
        ) : (
          <span className="text-xs text-grey">1 of {CARDS}</span>
        )}
        {prev && (
          <span className="text-xs text-grey">
            {card} of {CARDS}
          </span>
        )}
        {next ? (
          <Link
            href={next}
            className="flex min-h-12 items-center gap-2 rounded-full bg-text px-[22px] text-sm font-semibold text-bg transition-colors hover:bg-white"
          >
            Next
            <Icon name="arrow" size={16} stroke={1.8} />
          </Link>
        ) : (
          <Link
            href="/league"
            className="flex min-h-12 items-center gap-2 rounded-full border border-rule px-[22px] text-sm font-semibold transition-colors hover:border-grey"
          >
            Done
          </Link>
        )}
      </div>
    </main>
  );
}
