import { addDays, daysInclusive, describe, expect, it } from "vitest";
import { previousQuarter, quarterOf, scoringStart } from "./quarters";

describe("quarterOf", () => {
  it("maps dates to calendar quarters", () => {
    expect(quarterOf("2026-11-11")).toEqual({
      key: "2026-Q4",
      start: "2026-10-01",
      end: "2026-12-31",
    });
    expect(quarterOf("2026-01-01").key).toBe("2026-Q1");
    expect(quarterOf("2026-03-31").end).toBe("2026-03-31");
    expect(quarterOf("2026-06-30")).toMatchObject({
      key: "2026-Q2",
      end: "2026-06-30",
    });
    expect(quarterOf("2026-09-30").end).toBe("2026-09-30");
  });
});

describe("previousQuarter", () => {
  it("steps back within a year and across years", () => {
    expect(previousQuarter(quarterOf("2026-11-11")).key).toBe("2026-Q3");
    expect(previousQuarter(quarterOf("2026-02-01")).key).toBe("2025-Q4");
  });
});

describe("scoringStart", () => {
  const q = quarterOf("2026-11-11");
  it("uses the quarter start for members who joined earlier", () => {
    expect(scoringStart(q, "2026-08-15")).toBe("2026-10-01");
  });
  it("uses the join date for late joiners", () => {
    expect(scoringStart(q, "2026-11-03")).toBe("2026-11-03");
  });
});

describe("day helpers", () => {
  it("adds days across month and year ends", () => {
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
  });

  it("counts days inclusively", () => {
    expect(daysInclusive("2026-10-01", "2026-12-31")).toBe(92);
    expect(daysInclusive("2026-11-11", "2026-11-11")).toBe(1);
    expect(daysInclusive("2026-11-11", "2026-11-10")).toBe(0);
  });
});
