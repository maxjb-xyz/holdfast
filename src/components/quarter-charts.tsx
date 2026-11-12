import type { Point } from "@/lib/chart";
import { linePath, paddedDomain } from "@/lib/chart";
import { monthName, shortDate, signedPercent } from "@/lib/format";
import { addDays, daysInclusive, type Quarter } from "@/lib/quarters";

const C = {
  text: "#ededeb",
  sub: "#b9bcc2",
  dim: "#8e929b",
  grey: "#646973",
  rule: "#2a2d33",
  faint: "#1f2126",
  you: "#6393ff",
};
const MONO = "var(--font-mono)";
const SANS = "var(--font-sans)";

/** A person's quarter as one small line. Blue for the viewer's real leagues. */
export function Spark({
  series,
  width = 150,
  height = 30,
  quiet = false,
}: {
  series: readonly Point[];
  width?: number;
  height?: number;
  quiet?: boolean;
}) {
  const colour = quiet ? C.grey : C.you;
  if (series.length < 2) {
    return (
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width={width}
        height={height}
        aria-hidden="true"
        className="block flex-none"
      >
        <path
          d={`M0 ${height / 2} H${width}`}
          stroke={C.rule}
          strokeWidth={1}
        />
        <circle cx={3} cy={height / 2} r={3} fill={colour} />
      </svg>
    );
  }
  const domain = paddedDomain(
    series.map((p) => p.value),
    0.01,
  );
  const x = (i: number) => 2 + ((width - 8) * i) / (series.length - 1);
  const y = (v: number) =>
    3 + ((height - 6) * (domain.top - v)) / (domain.top - domain.bottom);
  const last = series[series.length - 1];
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width={width}
      height={height}
      aria-hidden="true"
      className="block flex-none"
    >
      <path
        d={`M0 ${y(0).toFixed(1)} H${width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      <path
        className="hf-draw"
        pathLength={1}
        d={linePath(series.map((p, i) => [x(i), y(p.value)] as const))}
        stroke={colour}
        strokeWidth={1.75}
        fill="none"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <circle
        cx={x(series.length - 1)}
        cy={y(last.value)}
        r={3}
        fill={colour}
      />
    </svg>
  );
}

type Frame = {
  quarter: Quarter;
  today: string;
  width: number;
  height: number;
  left: number;
  top: number;
  bottom: number;
};

function frame(f: Frame) {
  const days = daysInclusive(f.quarter.start, f.quarter.end);
  const x = (date: string) =>
    f.left +
    ((f.width - f.left) *
      Math.max(0, daysInclusive(f.quarter.start, date) - 1)) /
      days;
  const weeks = Array.from({ length: 14 }, (_, i) =>
    i < 13 ? x(addDays(f.quarter.start, i * 7)) : f.width,
  );
  const months = [0, 1, 2].map((i) => {
    const [year, month] = f.quarter.start.split("-").map(Number);
    const date = `${year}-${String(month + i).padStart(2, "0")}-01`;
    return { date, label: monthName(date).toUpperCase() };
  });
  return { x, weeks, months, floor: f.height - f.bottom };
}

/** The week ticks and month names along the bottom of a quarter. */
function Axis({ f, todayX }: { f: Frame; todayX: number }) {
  const { x, weeks, months, floor } = frame(f);
  return (
    <>
      {weeks.map((wx, i) => (
        <path
          key={i}
          d={`M${wx.toFixed(1)} ${floor} v5`}
          stroke={wx <= todayX ? C.grey : C.rule}
          strokeWidth={1}
        />
      ))}
      <path
        d={`M${f.left} ${floor} H${f.width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      {months.map((m) => (
        <text
          key={m.date}
          x={x(m.date) + 1}
          y={floor + 24}
          fontFamily={MONO}
          fontSize={11}
          fill={m.date <= f.today ? C.dim : C.grey}
          style={{ letterSpacing: "0.08em" }}
        >
          {m.label}
        </text>
      ))}
      <text
        x={f.width}
        y={floor + 24}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11}
        fill={C.grey}
        style={{ letterSpacing: "0.08em" }}
      >
        {shortDate(f.quarter.end).toUpperCase()}
      </text>
    </>
  );
}

/**
 * The quarter laid out with the viewer's line about to begin: shown during
 * the first run, before there is a score to draw.
 */
export function StartChart({
  quarter,
  today,
  series,
}: {
  quarter: Quarter;
  today: string;
  /** The viewer's line so far, when their history is already known. */
  series?: readonly Point[];
}) {
  const f: Frame = {
    quarter,
    today,
    width: 760,
    height: 470,
    left: 44,
    top: 34,
    bottom: 38,
  };
  const { x, floor } = frame(f);
  const has = series !== undefined && series.length > 1;
  const values = has ? series.map((p) => p.value) : [];
  const domain = has
    ? paddedDomain(values, 0.03)
    : { top: 0.03, bottom: -0.015 };
  const y = (v: number) =>
    f.top + ((floor - f.top) * (domain.top - v)) / (domain.top - domain.bottom);
  const ticks = has
    ? [domain.bottom / 2, domain.top / 2].filter((v) => Math.abs(v) > 0.002)
    : [-0.01, 0.01, 0.02];
  const tx = x(today);
  const endValue = has ? series[series.length - 1].value : 0;
  // The label sits on whichever side of today has room.
  const side = tx > f.width * 0.45 ? -1 : 1;
  return (
    <svg
      viewBox={`0 0 ${f.width} ${f.height}`}
      width="100%"
      role="img"
      aria-label={
        has
          ? `Your return this quarter so far, ${signedPercent(endValue)}.`
          : "The current quarter. Your line starts at zero today."
      }
      className="block overflow-visible"
    >
      {ticks.map((v) => (
        <g key={v}>
          <path
            d={`M${f.left} ${y(v).toFixed(1)} H${f.width}`}
            stroke={C.faint}
            strokeWidth={1}
          />
          <text
            x={f.left - 12}
            y={y(v) + 4}
            textAnchor="end"
            fontFamily={MONO}
            fontSize={11}
            fill={C.grey}
          >
            {signedPercent(v, has ? 1 : 0)}
          </text>
        </g>
      ))}
      <path
        d={`M${f.left} ${y(0).toFixed(1)} H${f.width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      <text
        x={f.left - 12}
        y={y(0) + 4}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11}
        fill={C.grey}
      >
        0%
      </text>
      <Axis f={f} todayX={tx} />
      <path
        d={`M${tx.toFixed(1)} ${f.top - 10} V${floor}`}
        stroke={C.grey}
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      <text
        x={tx}
        y={f.top - 18}
        textAnchor="middle"
        fontFamily={MONO}
        fontSize={11}
        fill={C.sub}
        style={{ letterSpacing: "0.08em" }}
      >
        {shortDate(today).toUpperCase()}
      </text>
      {has && (
        <path
          className="hf-draw"
          pathLength={1}
          d={linePath(series.map((p) => [x(p.date), y(p.value)] as const))}
          stroke={C.you}
          strokeWidth={2.25}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <circle
        className="hf-pulse"
        cx={tx}
        cy={y(endValue)}
        r={9}
        fill="none"
        stroke={C.you}
        strokeWidth={1}
        opacity={0.35}
      />
      <circle cx={tx} cy={y(endValue)} r={4.5} fill={C.you} />
      <text
        x={tx + side * 18}
        y={y(endValue) - 38}
        textAnchor={side < 0 ? "end" : "start"}
        fontFamily={MONO}
        fontSize={11}
        fill={C.dim}
        style={{ letterSpacing: "0.08em" }}
      >
        {has
          ? `${signedPercent(endValue)} · THIS QUARTER SO FAR`
          : "0.00% · SCORED FROM TOMORROW"}
      </text>
      <text
        x={tx + side * 18}
        y={y(endValue) - 16}
        textAnchor={side < 0 ? "end" : "start"}
        fontFamily={SANS}
        fontSize={15}
        fontWeight={500}
        fill={C.you}
      >
        {has ? "You are here" : "You start here"}
      </text>
    </svg>
  );
}

/**
 * A new league before anyone else has joined: the viewer's line, and the
 * open places waiting in the unplayed part of the quarter.
 */
export function PreviewChart({
  quarter,
  today,
  series,
  places,
}: {
  quarter: Quarter;
  today: string;
  /** The viewer's line from the league's start. Empty when it starts today. */
  series: readonly Point[];
  /** Places still open after the viewer. */
  places: number;
}) {
  const f: Frame = {
    quarter,
    today,
    width: 760,
    height: 420,
    left: 0,
    top: 20,
    bottom: 30,
  };
  const { x, weeks, floor } = frame(f);
  const has = series.length > 1;
  const domain = has
    ? paddedDomain(
        series.map((p) => p.value),
        0.03,
      )
    : { top: 0.03, bottom: -0.015 };
  const y = (v: number) =>
    f.top + ((floor - f.top) * (domain.top - v)) / (domain.top - domain.bottom);
  const tx = Math.min(x(today), f.width - 250);
  const scale = x(today) > 0 ? tx / x(today) : 1;
  const sx = (date: string) => x(date) * scale;
  const value = has ? series[series.length - 1].value : 0;
  const shown = Math.min(places, 3);
  const firstRow = Math.min(
    Math.max(y(value) - 8, f.top + 8),
    floor - 40 - shown * 34,
  );
  const rowY = (i: number) => firstRow + i * 34;
  return (
    <svg
      viewBox={`0 0 ${f.width} ${f.height}`}
      width="100%"
      role="img"
      aria-label={`A preview of the new league. You are its first member and ${places} places are open.`}
      className="block overflow-visible"
    >
      <path
        d={`M0 ${y(0).toFixed(1)} H${f.width}`}
        stroke={C.rule}
        strokeWidth={1}
      />
      <path d={`M0 ${floor} H${f.width}`} stroke={C.rule} strokeWidth={1} />
      {weeks.map((wx, i) => (
        <path
          key={i}
          d={`M${wx.toFixed(1)} ${floor} v5`}
          stroke={wx <= x(today) ? C.grey : C.rule}
          strokeWidth={1}
        />
      ))}
      {has && (
        <path
          className="hf-draw"
          pathLength={1}
          d={linePath(series.map((p) => [sx(p.date), y(p.value)] as const))}
          stroke={C.you}
          strokeWidth={2.25}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      )}
      <path
        d={`M${tx.toFixed(1)} ${f.top - 6} V${floor}`}
        stroke={C.grey}
        strokeWidth={1}
        strokeDasharray="2 4"
      />
      <circle cx={tx} cy={y(value)} r={4.5} fill={C.you} />
      <text
        x={tx + 34}
        y={rowY(0) + 5}
        fontFamily={MONO}
        fontSize={12}
        fill={C.dim}
      >
        1
      </text>
      <text
        x={tx + 60}
        y={rowY(0) + 5}
        fontFamily={SANS}
        fontSize={16}
        fontWeight={500}
        fill={C.you}
      >
        You
      </text>
      <text
        x={f.width}
        y={rowY(0) + 5}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={15}
        fill={C.you}
      >
        {signedPercent(value)}
      </text>
      {Array.from({ length: shown }, (_, i) => (
        <g key={i}>
          <circle
            cx={tx + 38}
            cy={rowY(i + 1)}
            r={3}
            fill="none"
            stroke={C.grey}
            strokeWidth={1.25}
            strokeDasharray="2 2"
          />
          <text
            x={tx + 60}
            y={rowY(i + 1) + 5}
            fontFamily={SANS}
            fontSize={15}
            fill={C.grey}
          >
            Open place
          </text>
        </g>
      ))}
      {places > shown && (
        <text
          x={tx + 60}
          y={rowY(shown) + 34}
          fontFamily={SANS}
          fontSize={12}
          fill={C.grey}
        >
          and {places - shown} more
        </text>
      )}
      <text
        x={1}
        y={floor + 24}
        fontFamily={MONO}
        fontSize={11}
        fill={C.dim}
        style={{ letterSpacing: "0.08em" }}
      >
        {shortDate(quarter.start).toUpperCase()}
      </text>
      <text
        x={f.width}
        y={floor + 24}
        textAnchor="end"
        fontFamily={MONO}
        fontSize={11}
        fill={C.grey}
        style={{ letterSpacing: "0.08em" }}
      >
        {shortDate(quarter.end).toUpperCase()}
      </text>
    </svg>
  );
}
