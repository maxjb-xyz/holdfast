import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";
import type { HabitFacts } from "@/lib/badges";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/** One row per person, keyed by their SnapTrade OAuth subject. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Privacy: what league friends can see. Dollar amounts are never shared.
  showReturn: integer("show_return", { mode: "boolean" })
    .notNull()
    .default(true),
  showBadges: integer("show_badges", { mode: "boolean" })
    .notNull()
    .default(true),
  showHoldings: integer("show_holdings", { mode: "boolean" })
    .notNull()
    .default(false),
  // Set to the last day that synced when the SnapTrade link breaks. The
  // member's score freezes there and their rank shows as paused.
  pausedSince: text("paused_since"),
  lastSyncedAt: integer("last_synced_at", { mode: "timestamp" }),
  // When a sync last started, so two never run for one person at once.
  syncClaimedAt: integer("sync_claimed_at", { mode: "timestamp" }),
  // Why the last sync stopped short, shown to the person. Cleared when the
  // next one starts.
  lastSyncError: text("last_sync_error"),
  createdAt: createdAt(),
});

/** SnapTrade OAuth tokens, encrypted with TOKEN_ENCRYPTION_KEY. Server only. */
export const oauthTokens = sqliteTable("oauth_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessExpiresAt: integer("access_expires_at", {
    mode: "timestamp",
  }).notNull(),
  scope: text("scope").notNull().default(""),
  // "active", "refreshing" (a refresh is in flight) or "needs_reconnect"
  // (the person has to sign in again; their rank shows as paused).
  status: text("status").notNull().default("active"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** One sign-in attempt in flight: the state, PKCE verifier and nonce. */
export const oauthStates = sqliteTable("oauth_states", {
  state: text("state").primaryKey(),
  codeVerifier: text("code_verifier").notNull(),
  nonce: text("nonce").notNull(),
  returnTo: text("return_to"),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

/** Browser sessions. Only a hash of the cookie's token is stored. */
export const sessions = sqliteTable("sessions", {
  id: text("id").primaryKey(),
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

/** Brokerage accounts the user linked in SnapTrade. */
export const accounts = sqliteTable("accounts", {
  id: text("id").primaryKey(), // SnapTrade account id
  userId: text("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  label: text("label").notNull(), // shown only to the owner
  // The parts the label is built from, for screens that lay them out apart.
  // Null on rows that have not synced since these were added.
  institution: text("institution"), // the brokerage, such as "Fidelity"
  name: text("name"), // the account's own name or type, such as "Roth IRA"
  lastFour: text("last_four"), // last four characters of the account number
  // How many securities the account held at the last sync that could read them.
  positionsCount: integer("positions_count"),
  // Whether this account counts toward league scores. The owner chooses.
  counted: integer("counted", { mode: "boolean" }).notNull().default(true),
  // False when the brokerage connection behind the account is disabled.
  connected: integer("connected", { mode: "boolean" }).notNull().default(true),
  lastSyncedOn: text("last_synced_on"), // YYYY-MM-DD
  // The last day the brokerage was asked for this account's value history,
  // and the first day that history filled in. Both YYYY-MM-DD. historyFrom
  // stays null until a backfill has worked.
  historyCheckedOn: text("history_checked_on"),
  historyFrom: text("history_from"),
});

/**
 * A short rolling window of account balances, the only dollar amounts kept.
 * Scoring needs yesterday's balance to work out today's return, and a few
 * extra days let a deposit that the brokerage reports late be corrected.
 * Rows older than the window are deleted on every sync.
 */
export const balanceSnapshots = sqliteTable(
  "balance_snapshots",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    balance: real("balance").notNull(),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

/**
 * One row per account per day. dailyReturn is the day's return with deposits
 * and withdrawals removed; quarterly scores chain these together.
 */
export const dailyReturns = sqliteTable(
  "daily_returns",
  {
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
    date: text("date").notNull(), // YYYY-MM-DD
    dailyReturn: real("daily_return").notNull(),
    // True when the brokerage gave incomplete data for this day.
    partial: integer("partial", { mode: "boolean" }).notNull().default(false),
    // The account's share (0 to 1) of the user's total balance at the start
    // of the day. Lets several accounts be blended without storing dollars.
    // Null when the share could not be worked out that day.
    weight: real("weight"),
    // Net deposits that day as a fraction of the starting balance.
    flowRate: real("flow_rate").notNull().default(0),
    // True when the day was rebuilt from the brokerage's estimated value
    // history, for days before Holdfast was watching the account.
    estimated: integer("estimated", { mode: "boolean" })
      .notNull()
      .default(false),
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

/**
 * A person's habit facts as of their last sync: months with a buy, dividend
 * dates, holdings as shares of the portfolio, and how long the oldest holding
 * has been held. Tickers, dates and percentages only.
 */
export const userFacts = sqliteTable("user_facts", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  facts: text("facts", { mode: "json" }).$type<HabitFacts>().notNull(),
  // Prices at the start of the quarter, to show each holding's change.
  quarter: text("quarter").notNull(),
  startPrices: text("start_prices", { mode: "json" })
    .$type<Record<string, number>>()
    .notNull(),
  // The day each current holding was first seen, for the One Year Hold badge
  // when the brokerage's history does not reach back to the purchase.
  firstSeen: text("first_seen", { mode: "json" })
    .$type<Record<string, string>>()
    .notNull()
    .default({}),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Habit facts frozen at the end of each quarter, for that quarter's Wrapped. */
export const quarterSnapshots = sqliteTable(
  "quarter_snapshots",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quarter: text("quarter").notNull(), // e.g. "2026-Q4"
    facts: text("facts", { mode: "json" }).$type<HabitFacts>().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.quarter] })],
);

export const leagues = sqliteTable("leagues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id").references(() => users.id, {
    onDelete: "set null",
  }),
  createdOn: text("created_on").notNull(), // YYYY-MM-DD
  // Set when the league was started from a day before it was made. This is
  // the first day scored, for every member, using backfilled history.
  startOn: text("start_on"), // YYYY-MM-DD
});

export const leagueMembers = sqliteTable(
  "league_members",
  {
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    joinedOn: text("joined_on").notNull(), // late joiners are scored from here
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId] })],
);

export const badges = sqliteTable(
  "badges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key").notNull(), // e.g. "one_year_hold"
    quarter: text("quarter").notNull(), // e.g. "2026-Q4"
    earnedOn: text("earned_on").notNull(), // YYYY-MM-DD
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey, t.quarter] })],
);
