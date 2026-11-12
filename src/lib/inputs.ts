/** Checks on text that arrives from outside: form fields and query strings. */

export const LEAGUE_NAME_MAX = 40;

export const DISPLAY_NAME_MAX = 40;

/**
 * Looks a query-string key up in a table of fixed messages. Only the table's
 * own keys count, so "__proto__" and the like find nothing.
 */
export function pickNotice(
  table: Readonly<Record<string, string>>,
  key: unknown,
): string | undefined {
  return typeof key === "string" && Object.hasOwn(table, key)
    ? table[key]
    : undefined;
}

function cleanName(raw: string, max: number): string | null {
  const name = raw
    .replace(
      /[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff<>]/g,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
  const cut = Array.from(name).slice(0, max).join("").trim();
  return cut.length > 0 ? cut : null;
}

/** Trims a league name and strips control characters and angle brackets. */
export function cleanLeagueName(raw: string): string | null {
  return cleanName(raw, LEAGUE_NAME_MAX);
}

/** The name friends see. Same cleaning as a league name. */
export function cleanDisplayName(raw: string): string | null {
  return cleanName(raw, DISPLAY_NAME_MAX);
}

/** How far back a league can be started. Brokerage history reaches a year. */
export const LEAGUE_START_MAX_DAYS = 365;

/**
 * The first day a new league is scored on, when its maker picked one in the
 * past. Null for today, a missing value or anything out of range, which all
 * mean the league starts today.
 */
export function cleanStartDate(
  raw: string | null | undefined,
  today: string,
): string | null {
  const value = (raw ?? "").trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const time = Date.parse(`${value}T00:00:00Z`);
  // Rejects days that do not exist, such as February 30th.
  if (Number.isNaN(time) || new Date(time).toISOString().slice(0, 10) !== value) {
    return null;
  }
  const earliest = new Date(Date.parse(`${today}T00:00:00Z`) - LEAGUE_START_MAX_DAYS * 86_400_000)
    .toISOString()
    .slice(0, 10);
  return value >= earliest && value < today ? value : null;
}

/** Pulls an invite code out of whatever was pasted: a code or a whole link. */
export function inviteCodeFrom(pasted: string): string | null {
  const text = pasted.trim().replace(/[?#].*$/, "");
  const match = /(?:^|\/join\/)([A-Za-z0-9_-]{8,40})\/?$/.exec(text);
  return match ? match[1] : null;
}

/** Only paths inside the app are accepted as a place to return to. */
export function safeReturnTo(value: string | null | undefined): string | null {
  if (!value || value.length > 200) return null;
  if (!/^\/[A-Za-z0-9_\-/?=&.]*$/.test(value)) return null;
  if (value.startsWith("//") || value.startsWith("/api/")) return null;
  return value;
}
