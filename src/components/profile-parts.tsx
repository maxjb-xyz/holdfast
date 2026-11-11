import {
  domainTicks,
  paddedDomain,
  smoothPath,
  splitByPartial,
  thin,
} from "@/lib/chart";
import { monthName, ordinal, quarterLabel, signedPercent } from "@/lib/format";
import type { BadgeTile, CareerQuarter } from "@/lib/pages";
import { addDays, daysInclusive } from "@/lib/quarters";
import type { Holding } from "@/lib/badges";

const C = {
  bg: "#08090A",
  text: "#EDEDEB",
  sub: "#B9BCC2",
  dim: "#8E929B",
  grey: "#646973",
  rule: "#2A2D33",
  faint: "#1F2126",
  you: "#6393FF",
};
const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";
const SLOTS = 4;

function tick(v: number) {
  const pct = Number((v * 100).toFixed(2));
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

/** Return by quarter. Every quarter starts again from zero. */
export function CareerChart({
  quarters,
  width,
  height,
  compact = false,
}: {
  quarters: CareerQuarter[];
  width: number;
  height: number;
  compact?: boolean;
}) {
  const pl = compact ? 0 : 44;
  const pt = compact ? 8 : 34;
  const pb = compact ? 8 : 58;
  const qw = (width - pl) / SLOTS;
  const values = quarters.flatMap((q) => q.series.map((p) => p.value));
  const domain = paddedDomain(values, 0.03);
  const y = (v: number) =>
    pt + ((height - pt - pb) * (domain.top - v)) / (domain.top - domain.bottom);
  const ticks = domainTicks(values, 0.03, 3);
  const shown = quarters.slice(-SLOTS);

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={`Return in each quarter. Every quarter starts again from zero. ${shown
        .map(
          (q) =>
            `${quarterLabel(q.quarter.key)}: ${q.value === null ? "no score" : signedPercent(q.value)}`,
        )
        .join(". ")}.`}
      style={{ display: "block", overflow: "visible" }}
    >
      {!compact &&
        ticks.map((v) => (
          <g key={v}>
            <text
              x={pl - 12}
              y={y(v) + 4}
              textAnchor="end"
              fontFamily={MONO}
              fontSize={11}
              fill={C.grey}
            >
              {tick(v)}
            </text>
            {v !== 0 && (
              <path
                d={`M${pl} ${y(v).toFixed(1)} H${width}`}
                stroke={C.faint}
                strokeWidth={1}
              />
            )}
          </g>
        ))}
      <path
        d={`M${pl} ${y(0).toFixed(1)} H${width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      {shown.map((q, i) => {
        const x0 = pl + i * qw;
        const origin = addDays(q.quarter.start, -1);
        const span = daysInclusive(q.quarter.start, q.quarter.end);
        const x = (date: string) =>
          x0 + (qw * (daysInclusive(origin, date) - 1)) / span;
        const color = q.current ? C.you : C.sub;
        const stroke = q.current ? 2.25 : 1.5;
        const end = q.series[q.series.length - 1];
        return (
          <g key={q.quarter.key}>
            {i > 0 && (
              <path
                d={`M${x0.toFixed(1)} ${pt - (compact ? 0 : 10)} V${height - pb + (compact ? 0 : 10)}`}
                stroke={C.rule}
                strokeWidth={1}
              />
            )}
            {splitByPartial(thin(q.series, compact ? 4 : 3)).map((run, j) => (
              <path
                key={j}
                d={smoothPath(
                  run.points.map((p) => [x(p.date), y(p.value)]),
                  0.2,
                  4,
                )}
                stroke={color}
                strokeWidth={stroke}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={run.partial ? "1 5" : undefined}
              />
            ))}
            {end && (
              <circle
                cx={x(end.date)}
                cy={y(end.value)}
                r={q.current ? 4 : 3}
                fill={q.paused ? C.bg : color}
                stroke={color}
                strokeWidth={1.25}
              />
            )}
            {!compact && (
              <>
                <text
                  x={x0 + 12}
                  y={pt - 16}
                  fontFamily={MONO}
                  fontSize={11}
                  fill={q.current ? C.you : C.dim}
                  style={{ letterSpacing: "0.08em" }}
                >
                  {quarterLabel(q.quarter.key).toUpperCase()}
                  {q.current ? " · NOW" : ""}
                </text>
                <text
                  x={x0 + 12}
                  y={height - pb + 34}
                  fontFamily={MONO}
                  fontSize={14}
                  fill={q.current ? C.you : C.text}
                >
                  {q.value === null ? "–" : signedPercent(q.value)}
                </text>
                <text
                  x={x0 + 12}
                  y={height - pb + 52}
                  fontFamily={SANS}
                  fontSize={12}
                  fill={C.dim}
                >
                  {q.paused
                    ? "Paused"
                    : q.rank === null
                      ? "Not ranked"
                      : `${ordinal(q.rank)} of ${q.of}`}
                  {q.partial ? ", partial" : ""}
                </text>
              </>
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** Twelve dots, one per month. Filled when there was a buy. */
export function Rhythm({
  months,
  size,
}: {
  months: { month: string; bought: boolean }[];
  size: number;
}) {
  const count = months.filter((m) => m.bought).length;
  return (
    <div
      className="grid grid-cols-[repeat(12,minmax(0,1fr))] gap-1"
      role="img"
      aria-label={`Months with a buy over the last year: ${count} of 12.`}
    >
      {months.map((m) => (
        <span key={m.month} className="flex flex-col items-center gap-2">
          <span
            className={`box-border rounded-full ${m.bought ? "bg-text" : "border border-grey"}`}
            style={{ width: size, height: size }}
          />
          <span className="font-mono text-[10px] text-grey">
            {monthName(m.month).charAt(0)}
          </span>
        </span>
      ))}
    </div>
  );
}

/** Finishing position in each quarter, as a column of dots with first place on top. */
export function Ladder({ quarters }: { quarters: CareerQuarter[] }) {
  const shown = quarters.slice(-SLOTS).filter((q) => q.rank !== null);
  if (shown.length === 0) {
    return (
      <p className="m-0 text-xs text-grey">
        Finishing places show here once a quarter has a ranking.
      </p>
    );
  }
  return (
    <div
      className="grid grid-cols-4 gap-2"
      role="img"
      aria-label={`Finishing position by quarter: ${shown
        .map(
          (q) =>
            `${quarterLabel(q.quarter.key)} ${ordinal(q.rank as number)} of ${q.of}`,
        )
        .join(", ")}.`}
    >
      {shown.map((q) => (
        <div key={q.quarter.key} className="flex flex-col items-start gap-2.5">
          <div className="flex min-h-[73px] flex-col gap-[5px]">
            {Array.from({ length: Math.min(q.of, 8) }, (_, i) => (
              <span
                key={i}
                className={`box-border size-2 rounded-full ${
                  i + 1 === q.rank
                    ? q.current
                      ? "bg-you"
                      : "bg-text"
                    : "border border-grey"
                }`}
              />
            ))}
          </div>
          <span className="flex flex-col leading-[1.35]">
            <span
              className={`font-mono text-[11px] ${q.current ? "text-you" : "text-sub"}`}
            >
              {ordinal(q.rank as number)}
            </span>
            <span className="font-mono text-[10px] text-grey">
              {q.quarter.key.split("-")[1]}
            </span>
          </span>
        </div>
      ))}
    </div>
  );
}

/** Holdings as bars against the 25% Well Spread mark. Shown only to the owner. */
export function HoldingBars({
  holdings,
}: {
  holdings: (Holding & { over: boolean })[];
}) {
  return (
    <div>
      {holdings.map((h) => (
        <div
          key={h.ticker}
          className="grid min-h-9 grid-cols-[48px_minmax(0,1fr)_40px] items-center gap-x-3.5"
        >
          <span className="font-mono text-[12.5px]">{h.ticker}</span>
          <span className="relative flex h-3 items-center" aria-hidden="true">
            <span
              className={`h-0.5 ${h.over ? "bg-text" : "bg-grey"}`}
              style={{ width: `${Math.min(100, h.share * 250)}%` }}
            />
            <span className="absolute top-0 left-[62.5%] h-3 w-px bg-grey" />
          </span>
          <span
            className={`text-right font-mono text-[12.5px] ${h.over ? "text-text" : "text-sub"}`}
          >
            {Math.round(h.share * 100)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/** A badge as a ring with a type mark. Dashed until it is earned. */
export function Medal({
  badge,
  size = 52,
  short = false,
}: {
  badge: BadgeTile;
  size?: number;
  short?: boolean;
}) {
  const tone = badge.earned ? "text-text" : "text-dim";
  return (
    <div className="flex min-w-0 items-center gap-3" title={badge.rule}>
      <span
        aria-hidden="true"
        className={`box-border flex flex-none items-center justify-center rounded-full border tracking-[-0.02em] ${tone} ${
          badge.earned ? "border-sub" : "border-dashed border-grey"
        }`}
        style={{ width: size, height: size, fontSize: Math.round(size * 0.27) }}
      >
        {badge.mark}
      </span>
      <span className="flex min-w-0 flex-col leading-[1.3]">
        <span className={`font-medium ${tone}`}>
          {short ? badge.short : badge.name}
        </span>
        <span className="font-mono text-[11px] text-grey">
          {badge.earned ? badge.meta : badge.meta || "Not yet"}
          <span className="sr-only">
            {badge.earned ? ", earned" : ", not earned yet"}
          </span>
        </span>
      </span>
    </div>
  );
}

/** A setting that flips when pressed. Works without JavaScript: it is a form. */
export function Switch({
  label,
  hint,
  on,
  action,
  fields,
  disabled = false,
}: {
  label: string;
  hint: string;
  on: boolean;
  action: (formData: FormData) => Promise<void>;
  fields: Record<string, string>;
  disabled?: boolean;
}) {
  return (
    <form
      action={action}
      className="flex min-h-[52px] items-center justify-between gap-4 border-t border-faint"
    >
      {Object.entries(fields).map(([name, value]) => (
        <input key={name} type="hidden" name={name} value={value} />
      ))}
      <input type="hidden" name="on" value={String(!on)} />
      <span className="flex flex-col leading-[1.3]">
        <span>{label}</span>
        <span className="text-xs text-grey">{hint}</span>
      </span>
      <button
        type="submit"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={disabled}
        className={`flex h-6 w-10 flex-none cursor-pointer items-center rounded-xl border p-0 transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
          on
            ? "border-text bg-text"
            : "border-rule bg-transparent hover:border-grey"
        }`}
      >
        <span
          className={`size-[18px] rounded-full transition-[margin] ${on ? "ml-[18px] bg-bg" : "ml-0.5 bg-dim"}`}
        />
      </button>
    </form>
  );
}
