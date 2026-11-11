import {
  domainTicks,
  paddedDomain,
  smoothPath,
  splitByPartial,
} from "@/lib/chart";
import {
  monthName,
  shortDate,
  signedNumber,
  signedPercent,
} from "@/lib/format";
import type { LeaguePage, LeaguePageRow } from "@/lib/pages";
import { RANGE_DAYS } from "@/lib/pages";
import { addDays, daysInclusive } from "@/lib/quarters";

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

/** Where the chart's first day sits, and how many days it spans up to today. */
function frame(page: LeaguePage) {
  const windowDays = RANGE_DAYS[page.range];
  if (windowDays === null) {
    return {
      origin: addDays(page.quarter.start, -1),
      today: page.dayOfQuarter,
      total: page.daysInQuarter,
      quarter: true,
    };
  }
  return {
    origin: addDays(page.asOf, -windowDays),
    today: windowDays,
    total: windowDays,
    quarter: false,
  };
}

const short = (name: string) =>
  name.length > 17 ? `${name.slice(0, 16)}…` : name;

function percentTick(v: number) {
  const pct = Number((v * 100).toFixed(2));
  return `${pct > 0 ? "+" : pct < 0 ? "−" : ""}${Math.abs(pct)}%`;
}

function Lines({
  rows,
  x,
  y,
  todayX,
  youWidth,
  otherWidth,
  ghost = false,
}: {
  rows: LeaguePageRow[];
  x: (date: string) => number;
  y: (v: number) => number;
  todayX: number;
  youWidth: number;
  otherWidth: number;
  ghost?: boolean;
}) {
  const ordered = [...rows].sort((a, b) => Number(a.isYou) - Number(b.isYou));
  const leftEdge = Math.min(
    ...rows.filter((r) => r.chart.length > 0).map((r) => x(r.chart[0].date)),
  );
  return (
    <>
      {ordered.map((row) => {
        if (row.chart.length === 0) return null;
        const color = row.isYou ? C.you : ghost ? C.rule : C.grey;
        const width = row.isYou ? youWidth : otherWidth;
        const first = row.chart[0];
        const last = row.chart[row.chart.length - 1];
        return (
          <g key={row.userId}>
            {splitByPartial(row.chart).map((run, i) => (
              <path
                key={i}
                d={smoothPath(run.points.map((p) => [x(p.date), y(p.value)]))}
                stroke={color}
                strokeWidth={width}
                fill="none"
                strokeLinejoin="round"
                strokeLinecap="round"
                strokeDasharray={run.partial ? "1 5" : undefined}
              />
            ))}
            {row.paused && (
              <path
                d={`M${x(last.date).toFixed(1)} ${y(last.value).toFixed(1)} H${todayX.toFixed(1)}`}
                stroke={color}
                strokeWidth={width}
                strokeDasharray="5 4"
                fill="none"
              />
            )}
            {row.joinedThisQuarter &&
              first.date === row.joinedOn &&
              x(first.date) > leftEdge + 2 && (
                <circle
                  cx={x(first.date)}
                  cy={y(0)}
                  r={3}
                  fill={C.bg}
                  stroke={color}
                  strokeWidth={width}
                />
              )}
          </g>
        );
      })}
    </>
  );
}

/** The league as a chart: every member's line, with the standings at the line ends. */
export function LeagueChart({
  page,
  profileHref,
}: {
  page: LeaguePage;
  profileHref: (userId: string) => string;
}) {
  const W = 1000;
  const H = 500;
  const PL = 44;
  const PT = 30;
  const PB = 44;
  const f = frame(page);
  const share = f.quarter
    ? Math.min(0.52, Math.max(0.2, f.today / f.total))
    : 0.52;
  const proportional = f.quarter && Math.abs(share - f.today / f.total) < 1e-9;
  const index = (date: string) => daysInclusive(f.origin, date) - 1;
  const xi = (i: number) => PL + ((W - PL) * share * i) / Math.max(f.today, 1);
  const x = (date: string) => xi(index(date));
  const todayX = xi(f.today);

  const values = page.rows.flatMap((r) => r.chart.map((p) => p.value));
  const domain = paddedDomain(values);
  const y = (v: number) =>
    PT + ((H - PT - PB) * (domain.top - v)) / (domain.top - domain.bottom);
  const ticks = domainTicks(values);
  const axisY = H - PB + 6;

  // Tick marks along the bottom: weeks in the quarter view, days in the week view.
  const tickEvery = page.range === "week" && !f.quarter ? 1 : 7;
  const lastTick = proportional ? f.total : f.today;
  const tickDays: number[] = [];
  for (let d = 0; d <= lastTick; d += tickEvery) tickDays.push(d);
  if (proportional && tickDays[tickDays.length - 1] !== f.total)
    tickDays.push(f.total);

  // Month names sit at the first of each month. A window gets its start date.
  const labels: { i: number; text: string }[] = [];
  if (f.quarter) {
    for (let d = 1; d <= lastTick; d++) {
      const date = addDays(f.origin, d);
      if (date.endsWith("-01"))
        labels.push({ i: d - 1, text: monthName(date).toUpperCase() });
    }
  } else {
    labels.push({ i: 0, text: shortDate(f.origin).toUpperCase() });
  }

  const n = page.rows.length;
  const step = Math.min(60, (H - PT - PB - 30) / Math.max(n, 1));
  const firstRowY = PT + (H - PT - PB - step * (n - 1)) / 2 + 2;
  const rx = todayX + 64;
  const C7 = W - 118;
  const rangeLabel = f.quarter
    ? "QUARTER"
    : page.range === "month"
      ? "30D"
      : "7D";

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label="Each member's return up to today, with the standings listed beside the line ends"
      style={{ display: "block", overflow: "visible" }}
    >
      {ticks.map((v) => (
        <g key={v}>
          <path
            d={`M${PL} ${y(v).toFixed(1)} H${todayX.toFixed(1)}`}
            stroke={v === 0 ? C.rule : C.faint}
            strokeWidth={1}
          />
          <text
            x={PL - 12}
            y={y(v) + 4}
            textAnchor="end"
            fontFamily={MONO}
            fontSize={11}
            fill={C.grey}
          >
            {percentTick(v)}
          </text>
        </g>
      ))}
      {tickDays.map((d) => (
        <path
          key={d}
          d={`M${xi(d).toFixed(1)} ${axisY} v5`}
          stroke={d > f.today ? C.rule : C.grey}
          strokeWidth={1}
        />
      ))}
      {labels.map((l) => (
        <text
          key={l.i}
          x={xi(l.i) + 1}
          y={H - PB + 30}
          fontFamily={MONO}
          fontSize={11}
          fill={l.i <= f.today ? C.dim : C.grey}
          style={{ letterSpacing: "0.08em" }}
        >
          {l.text}
        </text>
      ))}
      {proportional && f.total - f.today > 10 && (
        <text
          x={W}
          y={H - PB + 30}
          textAnchor="end"
          fontFamily={MONO}
          fontSize={11}
          fill={C.grey}
          style={{ letterSpacing: "0.08em" }}
        >
          {shortDate(page.quarter.end).toUpperCase()}
        </text>
      )}
      {proportional && (
        <path d={`M${PL} ${axisY} H${W}`} stroke={C.rule} strokeWidth={1} />
      )}
      <path
        d={`M${PL} ${axisY} H${todayX.toFixed(1)}`}
        stroke={C.grey}
        strokeWidth={1}
      />
      <path
        d={`M${todayX.toFixed(1)} ${PT - 6} V${axisY}`}
        stroke={C.grey}
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      <text
        x={todayX}
        y={PT - 14}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={11}
        fill={C.sub}
        style={{ letterSpacing: "0.08em" }}
      >
        {shortDate(page.asOf).toUpperCase()}
      </text>

      <Lines
        rows={page.rows}
        x={x}
        y={y}
        todayX={todayX}
        youWidth={2.25}
        otherWidth={1.25}
      />

      <text
        x={C7}
        y={PT - 14}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11}
        fill={C.grey}
        style={{ letterSpacing: "0.08em" }}
      >
        {f.quarter ? "7D" : "QUARTER"}
      </text>
      <text
        x={W}
        y={PT - 14}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11}
        fill={C.grey}
        style={{ letterSpacing: "0.08em" }}
      >
        {rangeLabel}
      </text>
      {page.rows.map((row, i) => {
        const ry = firstRowY + i * step;
        const end = row.chart[row.chart.length - 1];
        const ey = end ? y(end.value) : y(0);
        const color = row.isYou ? C.you : row.paused ? C.dim : C.text;
        const lineColor = row.isYou ? C.you : C.grey;
        const mid = (todayX + rx) / 2;
        // The quieter middle column: 7 day change, or the quarter in a window view.
        const side = f.quarter
          ? row.paused
            ? null
            : row.week.value
          : row.score.value;
        return (
          <g key={row.userId}>
            <path
              d={`M${todayX.toFixed(1)} ${ey.toFixed(1)} C${mid.toFixed(1)} ${ey.toFixed(1)} ${mid.toFixed(1)} ${(ry - 5).toFixed(1)} ${(rx - 12).toFixed(1)} ${(ry - 5).toFixed(1)}`}
              stroke={lineColor}
              strokeWidth={1}
              fill="none"
              opacity={row.isYou ? 1 : 0.5}
            />
            <circle
              cx={todayX}
              cy={ey}
              r={row.isYou ? 4 : 3}
              fill={row.paused ? C.bg : lineColor}
              stroke={lineColor}
              strokeWidth={1.25}
            />
            <text x={rx} y={ry} fontFamily={MONO} fontSize={12} fill={C.dim}>
              {row.rank ?? "–"}
            </text>
            {row.move !== null && row.move > 0 && (
              <path d={`M${rx + 15} ${ry - 3} l3.5 -5 l3.5 5z`} fill={C.sub}>
                <title>{`Up ${row.move} this week`}</title>
              </path>
            )}
            {row.move !== null && row.move < 0 && (
              <path d={`M${rx + 15} ${ry - 8} l3.5 5 l3.5 -5z`} fill={C.grey}>
                <title>{`Down ${-row.move} this week`}</title>
              </path>
            )}
            <a
              href={profileHref(row.userId)}
              aria-label={`${row.shownName}, open profile`}
            >
              <text
                x={rx + 36}
                y={ry}
                fontFamily={SANS}
                fontSize={16}
                fontWeight={500}
                fill={color}
              >
                {short(row.shownName)}
              </text>
            </a>
            {row.note && (
              <text
                x={rx + 36}
                y={ry + 18}
                fontFamily={SANS}
                fontSize={12}
                fill={row.paused ? C.dim : C.grey}
              >
                {row.note}
              </text>
            )}
            {side !== null && (
              <text
                x={C7}
                y={ry}
                textAnchor="end"
                fontFamily={MONO}
                fontSize={12.5}
                fill={C.dim}
              >
                {signedNumber(side)}
              </text>
            )}
            <text
              x={W}
              y={ry}
              textAnchor="end"
              fontFamily={MONO}
              fontSize={15}
              fill={color}
            >
              {row.rangeValue === null ? "–" : signedPercent(row.rangeValue)}
            </text>
          </g>
        );
      })}
      <desc>{`Lines show the ${rangeLabel.toLowerCase()} view.`}</desc>
    </svg>
  );
}

/** Lines only, edge to edge. Used on phones and on the sign-in page. */
export function MiniChart({
  rows,
  asOf,
  origin,
  width = 390,
  height = 150,
  ghost = false,
  label = "Returns across the quarter so far",
}: {
  rows: LeaguePageRow[];
  asOf: string;
  origin: string;
  width?: number;
  height?: number;
  ghost?: boolean;
  label?: string;
}) {
  const days = Math.max(1, daysInclusive(origin, asOf) - 1);
  const x = (date: string) =>
    ((width - 8) * (daysInclusive(origin, date) - 1)) / days;
  const values = rows.flatMap((r) => r.chart.map((p) => p.value));
  const domain = paddedDomain(values);
  const y = (v: number) =>
    6 + ((height - 12) * (domain.top - v)) / (domain.top - domain.bottom);
  const you = rows.find((r) => r.isYou);
  const end = you?.chart[you.chart.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      role="img"
      aria-label={label}
      style={{ display: "block" }}
    >
      <path
        d={`M0 ${y(0).toFixed(1)} H${width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      <Lines
        rows={rows}
        x={x}
        y={y}
        todayX={width - 8}
        youWidth={2.25}
        otherWidth={1.1}
        ghost={ghost}
      />
      {end && !you?.paused && (
        <circle cx={x(end.date)} cy={y(end.value)} r={4} fill={C.you} />
      )}
    </svg>
  );
}
