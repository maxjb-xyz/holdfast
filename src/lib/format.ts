/** Display helpers. Returns are fractions in, text out. */

const MINUS = "−";

/** "+4.82" or "−0.38". No percent sign, so callers can style it separately. */
export function signedNumber(fraction: number, digits = 2): string {
  const pct = fraction * 100;
  const rounded = Number(pct.toFixed(digits));
  const sign = rounded < 0 ? MINUS : "+";
  return `${sign}${Math.abs(rounded).toFixed(digits)}`;
}

/** "+4.82%" or "−0.38%". */
export function signedPercent(fraction: number, digits = 2): string {
  return `${signedNumber(fraction, digits)}%`;
}

/** "31%" for a share of a whole. */
export function sharePercent(fraction: number): string {
  return `${Math.round(fraction * 100)}%`;
}

/** 1 -> "1st", 2 -> "2nd", 11 -> "11th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  const suffix = { 1: "st", 2: "nd", 3: "rd" }[n % 10] ?? "th";
  return `${n}${suffix}`;
}

const MONTHS = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
];

/** "2026-11-03" -> "Nov 3". */
export function shortDate(date: string): string {
  const [, month, day] = date.split("-").map(Number);
  return `${MONTHS[month - 1]} ${day}`;
}

/** "2026-11" or "2026-11-03" -> "Nov". */
export function monthName(date: string): string {
  return MONTHS[Number(date.split("-")[1]) - 1];
}

/** "2026-Q4" -> "Q4 2026". */
export function quarterLabel(key: string): string {
  const [year, q] = key.split("-");
  return `${q} ${year}`;
}

/** "3 days", "1 day". */
export function plural(n: number, unit: string): string {
  return `${n} ${unit}${n === 1 ? "" : "s"}`;
}

/** How long ago a date was, in the feed's short form: "today", "1d", "3w". */
export function ago(date: string, today: string): string {
  const days = Math.round(
    (Date.parse(`${today}T00:00:00Z`) - Date.parse(`${date}T00:00:00Z`)) /
      86_400_000,
  );
  if (days <= 0) return "today";
  if (days < 14) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}
