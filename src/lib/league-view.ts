/**
 * Turns members and their daily returns into everything the league screen
 * shows: standings, movement, the 7 day figure and each member's line.
 * Pure functions, shared by the demo league and real leagues.
 */

import { addDays, daysInclusive, type Quarter } from "./quarters";
import {
  cumulativeSeries,
  firstScoredDate,
  quarterScore,
  rankMoves,
  rankStandings,
  windowScore,
  type DailyReturnRow,
  type Score,
} from "./scoring";

export type LeagueMember = {
  userId: string;
  name: string;
  joinedOn: string;
  /** One row per day, already blended across the member's accounts. */
  rows: readonly DailyReturnRow[];
  /**
   * Set when the brokerage connection is broken: the last day that synced.
   * The member's score freezes there and they hold no rank until they reconnect.
   */
  pausedSince?: string;
};

export type LeagueRow = {
  userId: string;
  name: string;
  joinedOn: string;
  rank: number | null;
  /** Places gained since a week ago. Positive is up. Null when not comparable. */
  move: number | null;
  score: Score;
  week: Score;
  paused: boolean;
  joinedThisQuarter: boolean;
  series: { date: string; value: number; partial: boolean }[];
};

export type LeagueView = {
  quarter: Quarter;
  asOf: string;
  dayOfQuarter: number;
  daysInQuarter: number;
  rows: LeagueRow[];
};

/** The ranking as it stood at the end of a given day. */
export function standingsAsOf(
  members: readonly LeagueMember[],
  quarter: Quarter,
  asOf: string,
) {
  return rankStandings(
    members
      .filter((m) => m.joinedOn <= asOf)
      .map((m) => {
        const paused = m.pausedSince !== undefined && m.pausedSince < asOf;
        return {
          userId: m.userId,
          name: m.name,
          paused,
          score: quarterScore({
            rows: m.rows,
            quarter,
            joinedOn: m.joinedOn,
            asOf: paused ? (m.pausedSince as string) : asOf,
          }),
        };
      }),
  );
}

export function buildLeagueView(input: {
  members: readonly LeagueMember[];
  quarter: Quarter;
  asOf: string;
}): LeagueView {
  const { members, quarter } = input;
  const asOf = input.asOf < quarter.end ? input.asOf : quarter.end;
  const byId = new Map(members.map((m) => [m.userId, m]));

  const standings = standingsAsOf(members, quarter, asOf);
  const weekAgo = addDays(asOf, -7);
  const moves =
    weekAgo >= quarter.start
      ? rankMoves(standings, standingsAsOf(members, quarter, weekAgo))
      : new Map<string, number | null>();

  const rows = standings.map<LeagueRow>((s) => {
    const member = byId.get(s.userId) as LeagueMember;
    const from = firstScoredDate(quarter, member.joinedOn);
    const to = s.paused ? (member.pausedSince as string) : asOf;
    const weekFrom = addDays(to, -6) > from ? addDays(to, -6) : from;
    return {
      userId: s.userId,
      name: s.name,
      joinedOn: member.joinedOn,
      rank: s.rank,
      move: moves.get(s.userId) ?? null,
      score: s.score,
      week: windowScore(member.rows, weekFrom, to),
      paused: s.paused,
      joinedThisQuarter: member.joinedOn >= quarter.start,
      series: from <= to ? cumulativeSeries(member.rows, from, to) : [],
    };
  });

  return {
    quarter,
    asOf,
    dayOfQuarter: daysInclusive(quarter.start, asOf),
    daysInQuarter: daysInclusive(quarter.start, quarter.end),
    rows,
  };
}
