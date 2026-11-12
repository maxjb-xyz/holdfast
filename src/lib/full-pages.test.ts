import { describe, expect, it } from "vitest";
import { DEMO_VIEWER_ID, demoLeague } from "./demo";
import { badgesPage, leagueSummary } from "./full-pages";
import { leaguePage } from "./pages";

const TODAY = "2026-11-11";

describe("leagueSummary", () => {
  const league = demoLeague(TODAY);
  const row = leagueSummary(league, DEMO_VIEWER_ID, TODAY);
  const page = leaguePage(league, DEMO_VIEWER_ID, TODAY);

  it("matches the league page for the viewer", () => {
    expect(row.value).toBe(page.you?.score.value);
    expect(row.standing.toLowerCase()).toBe(page.standing.toLowerCase());
    expect(row.memberCount).toBe(league.members.length);
    expect(row.series.length).toBeGreaterThan(1);
  });

  it("says so when the viewer is not in the league", () => {
    const other = leagueSummary(league, "nobody", TODAY);
    expect(other.value).toBeNull();
    expect(other.standing).toBe("Not a member");
  });
});

describe("badgesPage", () => {
  const me = demoLeague(TODAY).members.find(
    (m) => m.userId === DEMO_VIEWER_ID,
  )!;
  const page = badgesPage(me, TODAY);

  it("lists every badge with four quarters of history", () => {
    expect(page.rows).toHaveLength(4);
    for (const row of page.rows) {
      expect(row.quarters).toHaveLength(4);
      expect(row.quarters.at(-1)?.current).toBe(true);
      expect(row.done).toBeGreaterThanOrEqual(0);
      expect(row.done).toBeLessThanOrEqual(row.of);
    }
  });

  it("counts a badge once per quarter, including one earned today", () => {
    expect(page.total).toBe(page.rows.reduce((n, r) => n + r.times, 0));
    for (const row of page.rows) {
      if (row.earnedNow) {
        expect(row.done).toBe(row.of);
        expect(row.quarters.at(-1)?.earned).toBe(true);
        expect(row.standing).toMatch(/^Earned/);
      }
    }
  });

  it("shows nothing earned for someone with no habits yet", () => {
    const blank = badgesPage(
      {
        ...me,
        earned: [],
        facts: {
          buyMonths: [],
          buyDates: [],
          dividendDates: [],
          holdings: [],
          holdingSince: null,
        },
      },
      TODAY,
    );
    expect(blank.total).toBe(0);
    expect(blank.mostEarned).toBeNull();
    expect(blank.rows.every((r) => !r.held && r.done === 0)).toBe(true);
  });
});
