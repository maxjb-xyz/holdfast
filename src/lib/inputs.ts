/** Checks on text that arrives from outside: form fields and query strings. */

export const LEAGUE_NAME_MAX = 40;

export const DISPLAY_NAME_MAX = 40;

function cleanName(raw: string, max: number): string | null {
  const name = raw
    .replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028-\u202f\u2060-\u206f\ufeff<>]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max)
    .trim();
  return name.length > 0 ? name : null;
}

/** Trims a league name and strips control characters and angle brackets. */
export function cleanLeagueName(raw: string): string | null {
  return cleanName(raw, LEAGUE_NAME_MAX);
}

/** The name friends see. Same cleaning as a league name. */
export function cleanDisplayName(raw: string): string | null {
  return cleanName(raw, DISPLAY_NAME_MAX);
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
