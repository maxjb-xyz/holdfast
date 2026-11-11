/** What a share card says. Percentages, names and badges only. */

import type { BadgeKey } from "./badges";
import { BADGE_KEYS } from "./badges";
import type { Wrapped } from "./pages";

export type ShareCard = {
  /** Quarter key, such as "2026-Q3". */
  q: string;
  name: string;
  style: string;
  league: string;
  value: number;
  finish: string | null;
  badges: BadgeKey[];
  /** The quarter's line, thinned to a few dozen values. */
  line: number[];
};

export function shareCard(w: Wrapped, displayName: string): ShareCard {
  const step = Math.max(1, Math.ceil(w.series.length / 32));
  const line = w.series
    .filter((_, i) => i % step === 0 || i === w.series.length - 1)
    .map((p) => Number(p.value.toFixed(4)));
  return {
    q: w.quarter.key,
    name: displayName.slice(0, 40),
    style: w.style,
    league: w.leagueName.slice(0, 60),
    value: Number(w.value.toFixed(6)),
    finish: w.finish,
    badges: w.newBadges,
    line,
  };
}

/** Checks a decoded payload really is a share card before it is rendered. */
export function parseShareCard(input: unknown): ShareCard | null {
  if (!input || typeof input !== "object") return null;
  const c = input as Record<string, unknown>;
  const text = (v: unknown, max: number) =>
    typeof v === "string" && v.length <= max;
  if (!text(c.q, 7) || !/^\d{4}-Q[1-4]$/.test(c.q as string)) return null;
  if (!text(c.name, 40) || !text(c.style, 40) || !text(c.league, 60))
    return null;
  if (typeof c.value !== "number" || !Number.isFinite(c.value)) return null;
  if (c.finish !== null && !text(c.finish, 20)) return null;
  if (
    !Array.isArray(c.badges) ||
    !c.badges.every((b) => BADGE_KEYS.includes(b as BadgeKey))
  )
    return null;
  if (
    !Array.isArray(c.line) ||
    c.line.length > 64 ||
    !c.line.every((n) => typeof n === "number" && Number.isFinite(n))
  )
    return null;
  return c as unknown as ShareCard;
}
