import { BADGES } from "@/lib/badges";
import { linePath } from "@/lib/chart";
import { quarterLabel, signedNumber } from "@/lib/format";
import type { ShareCard } from "@/lib/share";

/**
 * The card people share. It is one self-contained SVG so it can be shown on
 * the page and saved as an image. It never contains a dollar amount.
 */
export function ShareCardSvg({ card, id }: { card: ShareCard; id?: string }) {
  const W = 360;
  const H = 450;
  const lo = Math.min(0, ...card.line);
  const hi = Math.max(0, ...card.line);
  const span = hi - lo || 0.01;
  const cx = (i: number) =>
    28 + ((W - 56) * i) / Math.max(1, card.line.length - 1);
  const cy = (v: number) => 252 - ((v - lo) / span) * 64;
  const last = card.line.length - 1;
  const sans = "Geist, 'Helvetica Neue', Arial, sans-serif";
  const mono = "'Geist Mono', ui-monospace, Menlo, monospace";
  const serif = "'Geist Serif', Georgia, serif";
  return (
    <svg
      id={id}
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${W} ${H}`}
      width="100%"
      role="img"
      aria-label={`${card.name}, ${card.style}. ${quarterLabel(card.q)} return ${signedNumber(card.value)} percent${
        card.finish ? `, finished ${card.finish} in ${card.league}` : ""
      }.`}
      style={{ display: "block" }}
    >
      <rect width={W} height={H} rx={20} fill="#0D0E10" />
      <rect
        x={0.5}
        y={0.5}
        width={W - 1}
        height={H - 1}
        rx={19.5}
        fill="none"
        stroke="#2A2D33"
      />
      <text
        x={28}
        y={46}
        fontFamily={sans}
        fontSize={15}
        fontWeight={600}
        fill="#EDEDEB"
        letterSpacing="-0.01em"
      >
        Holdfast
      </text>
      <text
        x={W - 28}
        y={46}
        textAnchor="end"
        fontFamily={mono}
        fontSize={11}
        fill="#8E929B"
        letterSpacing="0.08em"
      >
        {quarterLabel(card.q).toUpperCase()} WRAPPED
      </text>
      <text
        x={28}
        y={92}
        fontFamily={serif}
        fontSize={20}
        fontWeight={350}
        fill="#B9BCC2"
        letterSpacing="-0.02em"
      >
        {card.value >= 0 ? "My quarter grew" : "My quarter dipped"}
      </text>
      <text
        x={24}
        y={166}
        fontFamily={sans}
        fontSize={76}
        fontWeight={400}
        fill="#EDEDEB"
        letterSpacing="-0.055em"
      >
        {signedNumber(card.value)}
        <tspan fontSize={34} fill="#8E929B" letterSpacing="0" dx={2}>
          %
        </tspan>
      </text>
      <path
        d={`M28 ${cy(0).toFixed(1)} H${W - 28}`}
        stroke="#2A2D33"
        strokeWidth={1}
      />
      {card.line.length > 1 && (
        <>
          <path
            d={linePath(card.line.map((v, i) => [cx(i), cy(v)]))}
            stroke="#6393FF"
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
          />
          <circle
            cx={cx(last)}
            cy={cy(card.line[last])}
            r={3.5}
            fill="#6393FF"
          />
        </>
      )}
      <path d={`M28 292 H${W - 28}`} stroke="#1F2126" strokeWidth={1} />
      <text
        x={28}
        y={322}
        fontFamily={sans}
        fontSize={16}
        fontWeight={500}
        fill="#EDEDEB"
      >
        {card.name}
      </text>
      <text x={28} y={342} fontFamily={sans} fontSize={13} fill="#8E929B">
        {card.style}
        {card.finish ? ` · ${card.finish} in ${card.league}` : ""}
      </text>
      {card.badges.slice(0, 4).map((key, i) => (
        <g key={key} transform={`translate(${28 + i * 46} 366)`}>
          <circle cx={17} cy={17} r={16.5} fill="none" stroke="#B9BCC2" />
          <text
            x={17}
            y={21}
            textAnchor="middle"
            fontFamily={sans}
            fontSize={10}
            fill="#EDEDEB"
            letterSpacing="-0.02em"
          >
            {BADGES[key].mark}
          </text>
        </g>
      ))}
      <text
        x={W - 28}
        y={387}
        textAnchor="end"
        fontFamily={mono}
        fontSize={10}
        fill="#646973"
        letterSpacing="0.08em"
      >
        {card.badges.length > 0
          ? `${card.badges.length} ${card.badges.length === 1 ? "BADGE" : "BADGES"} EARNED`
          : "PERCENTAGES ONLY"}
      </text>
      <text
        x={28}
        y={428}
        fontFamily={mono}
        fontSize={10}
        fill="#646973"
        letterSpacing="0.08em"
      >
        RETURN WITH DEPOSITS AND WITHDRAWALS REMOVED
      </text>
    </svg>
  );
}
