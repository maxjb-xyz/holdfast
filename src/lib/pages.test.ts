import { describe, expect, it } from "vitest";
import { DEMO_VIEWER_ID, demoLeague } from "./demo";
import { DEFAULT_PRIVACY, type League, type Player } from "./model";
import { career, leagueFeed, leaguePage, profilePage, wrapped } from "./pages";
import { addDays, quarterOf } from "./quarters";
import type { DailyReturnRow } from "./scoring";

const TODAY = "2026-11-11";
const q4 = quarterOf(TODAY);
const q3 = quarterOf("2026-09-30");

function player(
  id: string,
  perDay: number,
  over: Partial<Player> = {},
): Player {
  const rows: DailyReturnRow[] = [];
  const last = over.pausedSince ?? TODAY;
  for (let d = "2026-07-01"; d <= last; d = addDays(d, 1)) {
    rows.push({ date: d, dailyReturn: perDay, partial: false, flowRate: 0 });
  }
  return {
    userId: id,
    name: id.toUpperCase(),
    joinedOn: "2026-06-30",
    since: "2026-07-01",
    rows,
    facts: {
      buyMonths: [],
      buyDates: [],
      dividendDates: [],
      holdings: [],
      holdingSince: null,
    },
    snapshots: {},
    earned: [],
    privacy: DEFAULT_PRIVACY,
    accounts: [],
    ...over,
  };
}

const league = (members: Player[]): League => ({
  id: "l1",
  name: "Test",
  isDemo: false,
  inviteCode: "abc",
  ownerId: "a",
  createdOn: "2026-06-30",
  members,
});

describe("leaguePage", () => {
  const page = leaguePage(
    league([player("a", 0.001), player("b", 0.002), player("c", 0.0005)]),
    "a",
    TODAY,
  );

  it("places the viewer and names them You", () => {
    expect(page.you).toMatchObject({ rank: 2, shownName: "You", isYou: true });
    expect(page.standing).toBe("2nd of 3");
    expect(page.week).toBe(6);
    expect(page.daysLeft).toBe(50);
  });

  it("reports the gap to the member ahead in points", () => {
    const gap = page.stats.find((s) => s.label === "Gap to 1st");
    const ahead = page.rows[0].score.value as number;
    const mine = page.you?.score.value as number;
    expect(gap?.value).toBe(`${((ahead - mine) * 100).toFixed(2)} pts`);
  });

  it("reports a lead when the viewer is first", () => {
    const first = leaguePage(
      league([player("a", 0.003), player("b", 0.002)]),
      "a",
      TODAY,
    );
    expect(first.stats.some((s) => s.label === "Lead over 2nd")).toBe(true);
    expect(first.stats.some((s) => s.label.startsWith("Gap"))).toBe(false);
  });

  it("shows last quarter's podium and the viewer's place", () => {
    expect(page.lastQuarter?.quarter.key).toBe("2026-Q3");
    expect(page.lastQuarter?.top.map((t) => t.name)).toEqual(["B", "You", "C"]);
    expect(page.lastQuarter?.youPlayed).toBe(true);
  });

  it("restarts lines from zero in the week view", () => {
    const week = leaguePage(
      league([player("a", 0.001), player("b", 0.002)]),
      "a",
      TODAY,
      "week",
    );
    expect(week.you?.chart).toHaveLength(8);
    expect(week.you?.chart[0].value).toBe(0);
    expect(week.you?.chart.at(-1)?.value).toBeCloseTo(1.001 ** 7 - 1, 10);
    expect(week.you?.rangeValue).toBe(week.you?.chart.at(-1)?.value);
    expect(week.rows.map((r) => r.userId)).toEqual(["b", "a"]);
  });

  it("keeps a paused member flat and last in a window view", () => {
    const week = leaguePage(
      league([
        player("a", 0.001),
        player("b", 0.005, { pausedSince: "2026-10-20" }),
      ]),
      "a",
      TODAY,
      "week",
    );
    const b = week.rows.at(-1)!;
    expect(b.userId).toBe("b");
    expect(b.chart).toEqual([{ date: "2026-11-04", value: 0, partial: false }]);
    expect(b.rangeValue).toBeNull();
  });

  it("falls back to the quarter view while the quarter is shorter than the window", () => {
    const early = leaguePage(
      league([player("a", 0.001)]),
      "a",
      "2026-10-05",
      "month",
    );
    expect(early.range).toBe("quarter");
    expect(early.you?.chart).toHaveLength(6);
  });

  it("works for a viewer who is alone in a new league", () => {
    const solo = leaguePage(
      league([player("a", 0.001, { joinedOn: TODAY, since: TODAY })]),
      "a",
      TODAY,
    );
    expect(solo.standing).toBe("Not ranked yet");
    expect(solo.rows).toHaveLength(1);
    expect(solo.lastQuarter).toBeNull();
  });

  it("works for someone looking at a league they are not in", () => {
    const outside = leaguePage(league([player("a", 0.001)]), "nobody", TODAY);
    expect(outside.you).toBeNull();
    expect(outside.stats).toEqual([]);
  });
});

describe("leagueFeed", () => {
  it("reports an overtake that involves the viewer, once", () => {
    // b starts ahead, then a overtakes on Nov 9.
    const a = player("a", 0.001);
    const b = player("b", 0.001);
    const bump = (p: Player, date: string, r: number) => ({
      ...p,
      rows: p.rows.map((row) =>
        row.date === date ? { ...row, dailyReturn: r } : row,
      ),
    });
    const feed = leagueFeed(
      league([bump(a, "2026-11-09", 0.03), bump(b, "2026-10-05", 0.01)]),
      "a",
      TODAY,
    );
    const passes = feed.filter((f) => f.kind === "passed");
    expect(passes).toEqual([
      { kind: "passed", text: "You passed B for 1st", date: "2026-11-09" },
    ]);
  });

  it("does not call a pause an overtake", () => {
    const feed = leagueFeed(
      league([
        player("a", 0.001),
        player("b", 0.002, { pausedSince: "2026-11-05" }),
      ]),
      "a",
      TODAY,
    );
    expect(feed.filter((f) => f.kind === "passed")).toEqual([]);
    expect(feed.find((f) => f.kind === "paused")).toMatchObject({
      text: "B's link dropped, rank paused",
      date: "2026-11-06",
    });
  });

  it("hides badges a member keeps private", () => {
    const earned = [
      { key: "never_missed" as const, quarter: "2026-Q4", on: "2026-11-02" },
    ];
    const open = leagueFeed(
      league([player("a", 0), player("b", 0, { earned })]),
      "a",
      TODAY,
    );
    expect(open.some((f) => f.kind === "badge")).toBe(true);
    const closed = leagueFeed(
      league([
        player("a", 0),
        player("b", 0, {
          earned,
          privacy: { ...DEFAULT_PRIVACY, showBadges: false },
        }),
      ]),
      "a",
      TODAY,
    );
    expect(closed.some((f) => f.kind === "badge")).toBe(false);
  });
});

describe("profilePage", () => {
  const friend = player("b", 0.002, {
    facts: {
      buyMonths: ["2026-10", "2026-11"],
      buyDates: ["2026-10-02", "2026-11-03"],
      dividendDates: [],
      holdings: [
        { ticker: "VTI", share: 0.6, change: 0.05 },
        { ticker: "BND", share: 0.4, change: -0.01 },
      ],
      holdingSince: "2025-01-01",
    },
  });
  const l = league([player("a", 0.001), friend]);

  it("never shows a friend's holdings list or settings", () => {
    const page = profilePage(l, "b", "a", TODAY);
    expect(page?.isSelf).toBe(false);
    expect(page?.holdings).toBeNull();
    expect(page?.accounts).toBeNull();
    expect(page?.privacy).toBeNull();
    expect(page?.bestWorst).toBeNull();
    expect(page?.wrappedQuarter).toBeNull();
  });

  it("shows best and worst holding only when the friend allows it", () => {
    const open = league([
      player("a", 0.001),
      { ...friend, privacy: { ...DEFAULT_PRIVACY, showHoldings: true } },
    ]);
    const page = profilePage(open, "b", "a", TODAY);
    expect(page?.bestWorst?.best.ticker).toBe("VTI");
    expect(page?.bestWorst?.worst?.ticker).toBe("BND");
    expect(page?.holdings).toBeNull();
  });

  it("hides return history and badges when the friend turns them off", () => {
    const closed = league([
      player("a", 0.001),
      {
        ...friend,
        privacy: { showReturn: false, showBadges: false, showHoldings: false },
      },
    ]);
    const page = profilePage(closed, "b", "a", TODAY);
    expect(page?.career).toBeNull();
    expect(page?.badges).toBeNull();
    expect(page?.rhythm).toBeNull();
    expect(page?.stats.map((s) => s.label)).toEqual([
      "This quarter",
      "Current rank",
      "Quarters played",
    ]);
  });

  it("shows the owner everything", () => {
    const page = profilePage(l, "b", "b", TODAY);
    expect(page?.holdings?.map((h) => [h.ticker, h.over])).toEqual([
      ["VTI", true],
      ["BND", true],
    ]);
    expect(page?.career).toHaveLength(2);
    expect(page?.wrappedQuarter?.key).toBe("2026-Q3");
    expect(page?.badges).toHaveLength(4);
  });

  it("returns nothing for someone outside the league", () => {
    expect(profilePage(l, "zzz", "a", TODAY)).toBeNull();
  });
});

describe("career", () => {
  it("only lists quarters the player was in the league for", () => {
    const late = player("b", 0.001, {
      joinedOn: "2026-11-03",
      since: "2026-07-01",
    });
    const quarters = career(league([player("a", 0.001), late]), late, TODAY);
    expect(quarters.map((q) => q.quarter.key)).toEqual(["2026-Q4"]);
  });
});

describe("wrapped", () => {
  const l = league([
    player("a", 0.001, {
      rows: player("a", 0.001).rows.map((r) =>
        r.date === "2026-08-03" ? { ...r, flowRate: 0.05 } : r,
      ),
    }),
    player("b", 0.002),
  ]);

  it("separates growth from money added", () => {
    const w = wrapped(l, "a", q3, TODAY)!;
    expect(w.value).toBeCloseTo(1.001 ** 92 - 1, 10);
    expect(w.growth).toBe(w.value);
    expect(w.added).toBeGreaterThan(0.05);
    expect(w.added).toBeLessThan(0.06);
    expect(w.finish).toBe("2nd of 2");
    expect(w.bestWeek).toBeCloseTo(1.001 ** 7 - 1, 10);
  });

  it("is not available for the quarter still being played", () => {
    expect(wrapped(l, "a", q4, TODAY)).toBeNull();
    expect(wrapped(l, "a", q4, "2026-12-31")).toBeNull();
    expect(wrapped(l, "a", q4, "2027-01-01")).not.toBeNull();
  });

  it("is not available for a quarter the player missed", () => {
    const late = league([player("a", 0.001, { joinedOn: "2026-10-05" })]);
    expect(wrapped(late, "a", q3, TODAY)).toBeNull();
  });
});

describe("demo league pages", () => {
  it("builds every page for a spread of dates without failing", () => {
    for (const today of [
      "2026-10-01",
      "2026-10-02",
      TODAY,
      "2026-12-31",
      "2027-01-01",
      "2028-02-29",
    ]) {
      const l = demoLeague(today);
      const page = leaguePage(l, DEMO_VIEWER_ID, today);
      expect(page.rows.length).toBeGreaterThanOrEqual(5);
      expect(page.you).not.toBeNull();
      for (const range of ["month", "week"] as const) {
        expect(leaguePage(l, DEMO_VIEWER_ID, today, range).rows.length).toBe(
          page.rows.length,
        );
      }
      for (const member of l.members) {
        expect(
          profilePage(l, member.userId, DEMO_VIEWER_ID, today),
        ).not.toBeNull();
      }
      const w = wrapped(l, DEMO_VIEWER_ID, page.lastQuarter!.quarter, today);
      expect(w).not.toBeNull();
      expect(Number.isFinite(w!.value) && Number.isFinite(w!.added)).toBe(true);
    }
  });
});
