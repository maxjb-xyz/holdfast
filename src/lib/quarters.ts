/** Calendar-quarter helpers. All dates are UTC "YYYY-MM-DD" strings. */

export type Quarter = {
  /** e.g. "2026-Q4" */
  key: string;
  /** First day of the quarter, inclusive. */
  start: string;
  /** Last day of the quarter, inclusive. */
  end: string;
};

const pad = (n: number) => String(n).padStart(2, "0");

export function toDateString(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function quarterOf(date: string): Quarter {
  const [year, month] = date.split("-").map(Number);
  const q = Math.ceil(month / 3);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = startMonth + 2;
  // Day 0 of the next month is the last day of endMonth.
  const lastDay = new Date(Date.UTC(year, endMonth, 0)).getUTCDate();
  return {
    key: `${year}-Q${q}`,
    start: `${year}-${pad(startMonth)}-01`,
    end: `${year}-${pad(endMonth)}-${pad(lastDay)}`,
  };
}

export function previousQuarter(q: Quarter): Quarter {
  const dayBefore = new Date(`${q.start}T00:00:00Z`);
  dayBefore.setUTCDate(dayBefore.getUTCDate() - 1);
  return quarterOf(toDateString(dayBefore));
}

/**
 * The first day a member is scored from in a quarter: the quarter start,
 * or the day they joined if that is later.
 */
export function scoringStart(q: Quarter, joinedOn: string): string {
  return joinedOn > q.start ? joinedOn : q.start;
}

export function addDays(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return toDateString(d);
}

/** Number of days from `from` to `to`, inclusive of both. Zero if `to` is earlier. */
export function daysInclusive(from: string, to: string): number {
  const ms = Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`);
  return Math.max(0, Math.round(ms / 86_400_000) + 1);
}
