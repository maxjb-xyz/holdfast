import { describe, expect, it } from "vitest";
import { DEMO_VIEWER_ID, demoLeague } from "./demo";
import {
  accountLine,
  badgesPage,
  holdingsPage,
  leagueSummary,
} from "./full-pages";
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

describe("accountLine", () => {
  const base = { counted: true, connected: true };
  it("falls back to the label when the brokerage gave no details", () => {
    const line = accountLine({ id: "a", label: "Brokerage", ...base });
    expect(line.title).toBe("Brokerage");
    expect(line.brokerage).toBeNull();
    expect(line.detail).toBe("");
  });

  it("puts the brokerage under the account's own name", () => {
    const line = accountLine({
      id: "a",
      label: "Fidelity Roth IRA ··4471",
      ...base,
      institution: "Fidelity",
      name: "Roth IRA",
      lastFour: "4471",
      positions: 9,
    });
    expect(line.title).toBe("Roth IRA");
    expect(line.brokerage).toBe("Fidelity");
    expect(line.detail).toBe("··4471 · 9 positions");
  });

  it("does not repeat the brokerage in the title of an unnamed account", () => {
    const line = accountLine({
      id: "a",
      label: "Fidelity ··4471",
      ...base,
      connected: false,
      institution: "Fidelity",
      name: null,
      lastFour: "4471",
    });
    expect(line.title).toBe("Account");
    expect(line.brokerage).toBe("Fidelity");
    expect(line.detail).toBe("··4471 · Link dropped");
  });
});

describe("holdingsPage", () => {
  const me = demoLeague(TODAY).members.find(
    (m) => m.userId === DEMO_VIEWER_ID,
  )!;
  const accounts = [
    {
      id: "a1",
      label: "Roth",
      counted: true,
      connected: true,
      name: "Roth IRA",
      institution: "Fidelity",
    },
    {
      id: "a2",
      label: "Ind",
      counted: true,
      connected: true,
      name: "Individual",
    },
    { id: "a3", label: "Play", counted: false, connected: true },
  ];
  const player = {
    ...me,
    since: "2026-09-20",
    facts: {
      ...me.facts,
      holdings: [
        {
          ticker: "VTI",
          share: 0.6,
          change: 0.05,
          accounts: ["a1", "a2"],
          name: "Total Market",
        },
        { ticker: "AAPL", share: 0.4, change: -0.02, accounts: ["a2"] },
      ],
      otherHoldings: [{ ticker: "TSLA", share: 1, change: null }],
    },
  };
  const seen = { VTI: "2026-09-20", AAPL: "2026-10-15" };

  it("lists counted holdings largest first with their accounts", () => {
    const page = holdingsPage(player, accounts, seen, TODAY);
    expect(page.rows.map((r) => r.ticker)).toEqual(["VTI", "AAPL"]);
    expect(page.rows[0]).toMatchObject({
      over: true,
      largest: true,
      accounts: "Roth IRA, Individual",
      since: "Before Sep 2026",
    });
    expect(page.rows[1].since).toBe("Oct 2026");
    expect(page.stats[0]).toEqual({
      label: "Over the 25% limit",
      value: "By 35.0 pts",
    });
    expect(page.filters.map((f) => f.key)).toEqual([
      "all",
      "a1",
      "a2",
      "other",
    ]);
    expect(page.filters.find((f) => f.key === "a1")?.brokerage).toBe(
      "Fidelity",
    );
    expect(page.filters.find((f) => f.key === "a2")?.brokerage).toBeNull();
  });

  it("filters by account, shows left-out accounts apart, and ignores unknown scopes", () => {
    expect(
      holdingsPage(player, accounts, seen, TODAY, "a1").rows.map(
        (r) => r.ticker,
      ),
    ).toEqual(["VTI"]);
    const other = holdingsPage(player, accounts, seen, TODAY, "other");
    expect(other.rows.map((r) => r.ticker)).toEqual(["TSLA"]);
    expect(other.largest?.ticker).toBe("VTI");
    expect(holdingsPage(player, accounts, seen, TODAY, "nope").scope).toBe(
      "all",
    );
  });

  it("copes with no holdings at all", () => {
    const page = holdingsPage(
      { ...me, facts: { ...me.facts, holdings: [] } },
      [],
      {},
      TODAY,
    );
    expect(page.rows).toEqual([]);
    expect(page.largest).toBeNull();
    expect(page.filters).toEqual([]);
  });
});
