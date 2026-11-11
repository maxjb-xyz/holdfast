import { describe, expect, it } from "vitest";
import { buildLeagueView, scoredThrough, type LeagueMember } from "./league-view";
import { addDays, quarterOf } from "./quarters";

const TODAY = "2026-11-11";
const quarter = quarterOf(TODAY);

function member(userId: string, through: string, over: Partial<LeagueMember> = {}): LeagueMember {
  const rows = [];
  for (let d = quarter.start; d <= through; d = addDays(d, 1)) {
    rows.push({ date: d, dailyReturn: 0.001, partial: false });
  }
  return { userId, name: userId, joinedOn: "2026-06-01", rows, ...over };
}

describe("today's row arriving late", () => {
  it("is not a missing day: the member is scored through yesterday, without a partial flag", () => {
    const view = buildLeagueView({
      members: [member("early", TODAY), member("late", "2026-11-10")],
      quarter,
      asOf: TODAY,
    });
    const late = view.rows.find((r) => r.userId === "late")!;
    expect(late.score.partial).toBe(false);
    expect(late.score.daysMissing).toBe(0);
    expect(late.week.partial).toBe(false);
    expect(late.series.at(-1)).toMatchObject({ date: "2026-11-10", partial: false });
    const early = view.rows.find((r) => r.userId === "early")!;
    expect(early.series.at(-1)?.date).toBe(TODAY);
  });

  it("still flags a day that is truly missing", () => {
    const view = buildLeagueView({
      members: [member("gap", "2026-11-08")],
      quarter,
      asOf: TODAY,
    });
    expect(view.rows[0].score.partial).toBe(true);
    expect(view.rows[0].score.daysMissing).toBe(2);
  });

  it("does not forgive the last day of a finished quarter", () => {
    const last = quarterOf("2026-08-01");
    const m: LeagueMember = {
      userId: "x",
      name: "x",
      joinedOn: "2026-01-01",
      rows: [{ date: addDays(last.end, -1), dailyReturn: 0.01, partial: false }],
    };
    expect(scoredThrough(m, last.end, undefined)).toBe(last.end);
    const view = buildLeagueView({ members: [m], quarter: last, asOf: TODAY });
    expect(view.rows[0].score.partial).toBe(true);
  });

  it("holds a paused member at the day their link dropped", () => {
    const m = member("p", "2026-11-05", { pausedSince: "2026-11-05" });
    expect(scoredThrough(m, TODAY, TODAY)).toBe("2026-11-05");
  });
});
