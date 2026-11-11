import { sql } from "drizzle-orm";
import {
  integer,
  primaryKey,
  real,
  sqliteTable,
  text,
} from "drizzle-orm/sqlite-core";

const createdAt = () =>
  integer("created_at", { mode: "timestamp" })
    .notNull()
    .default(sql`(unixepoch())`);

/** One row per person, keyed by their SnapTrade OAuth subject. */
export const users = sqliteTable("users", {
  id: text("id").primaryKey(),
  displayName: text("display_name").notNull(),
  // Privacy: what league friends can see. Dollar amounts are never shared.
  showReturn: integer("show_return", { mode: "boolean" }).notNull().default(true),
  showBadges: integer("show_badges", { mode: "boolean" }).notNull().default(true),
  showHoldings: integer("show_holdings", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
});

/** SnapTrade OAuth tokens, encrypted with TOKEN_ENCRYPTION_KEY. Server only. */
export const oauthTokens = sqliteTable("oauth_tokens", {
  userId: text("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  accessTokenEnc: text("access_token_enc").notNull(),
  refreshTokenEnc: text("refresh_token_enc").notNull(),
  accessExpiresAt: integer("access_expires_at", { mode: "timestamp" }).notNull(),
  // "active" or "needs_reconnect" (refresh failed; ranks show as paused).
  status: text("status").notNull().default("active"),
  updatedAt: integer("updated_at", { mode: "timestamp" }).notNull(),
});

/** Browser sessions. The cookie holds only the random session id. */
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
  label: text("label").notNull(), // e.g. institution name, shown only to the owner
  // Last synced balance, kept only to chain the next day's return.
  lastBalance: real("last_balance"),
  lastSyncedOn: text("last_synced_on"), // YYYY-MM-DD
});

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
  },
  (t) => [primaryKey({ columns: [t.accountId, t.date] })],
);

export const leagues = sqliteTable("leagues", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  inviteCode: text("invite_code").notNull().unique(),
  ownerId: text("owner_id").references(() => users.id, { onDelete: "set null" }),
  isDemo: integer("is_demo", { mode: "boolean" }).notNull().default(false),
  createdAt: createdAt(),
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

/** Which of a member's accounts count in a given league. */
export const leagueMemberAccounts = sqliteTable(
  "league_member_accounts",
  {
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId, t.accountId] })],
);

export const badges = sqliteTable(
  "badges",
  {
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    badgeKey: text("badge_key").notNull(), // e.g. "one_year_hold"
    quarter: text("quarter").notNull(), // e.g. "2026-Q4"
    earnedAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.badgeKey, t.quarter] })],
);

/** Final standings saved when a quarter closes. */
export const quarterResults = sqliteTable(
  "quarter_results",
  {
    leagueId: text("league_id")
      .notNull()
      .references(() => leagues.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    quarter: text("quarter").notNull(),
    rank: integer("rank").notNull(),
    returnPct: real("return_pct").notNull(),
    partial: integer("partial", { mode: "boolean" }).notNull().default(false),
  },
  (t) => [primaryKey({ columns: [t.leagueId, t.userId, t.quarter] })],
);

/** League activity feed: badges earned, rank changes, Wrapped ready. */
export const activity = sqliteTable("activity", {
  id: integer("id").primaryKey({ autoIncrement: true }),
  leagueId: text("league_id")
    .notNull()
    .references(() => leagues.id, { onDelete: "cascade" }),
  userId: text("user_id").references(() => users.id, { onDelete: "cascade" }),
  kind: text("kind").notNull(), // "badge" | "rank_change" | "wrapped_ready"
  payload: text("payload", { mode: "json" }),
  createdAt: createdAt(),
});
