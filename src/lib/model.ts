/**
 * The shapes every screen is built from. A league is a list of players, and a
 * player is their daily returns plus their habit facts. The demo league fills
 * these from a generator and real leagues fill them from the database, so the
 * screens never need to know which one they are showing.
 */

import type { BadgeKey, HabitFacts } from "./badges";
import type { LeagueMember } from "./league-view";

export type Privacy = {
  /** Return history on the profile. League standings always show the return. */
  showReturn: boolean;
  showBadges: boolean;
  /** Best and worst holding, as ticker and percentage. */
  showHoldings: boolean;
};

export const DEFAULT_PRIVACY: Privacy = {
  showReturn: true,
  showBadges: true,
  showHoldings: false,
};

export type EarnedBadge = {
  key: BadgeKey;
  /** Quarter key, such as "2026-Q3". */
  quarter: string;
  /** The day it was earned. */
  on: string;
};

export type LinkedAccount = {
  id: string;
  label: string;
  /** Whether this account counts toward league scores. */
  counted: boolean;
  /** False when the brokerage connection behind it is broken. */
  connected: boolean;
};

export type Player = LeagueMember & {
  /** A short line about the player, shown in the demo league. */
  note?: string;
  /** The first day the player had a score anywhere. */
  since: string;
  /** Habit facts as of today. */
  facts: HabitFacts;
  /** Habit facts frozen at the end of past quarters, by quarter key. */
  snapshots: Record<string, HabitFacts>;
  earned: readonly EarnedBadge[];
  privacy: Privacy;
  accounts: readonly LinkedAccount[];
};

export type League = {
  id: string;
  name: string;
  isDemo: boolean;
  inviteCode: string | null;
  ownerId: string | null;
  createdOn: string;
  /** Set when the league is scored from a day before it was made. */
  startOn?: string;
  members: readonly Player[];
};

/** The most members a league can hold. Keeps the chart readable. */
export const MAX_LEAGUE_MEMBERS = 8;
