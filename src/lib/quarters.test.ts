import { describe, expect, it } from "vitest";
import {
  addDays,
  daysInclusive,
  previousQuarter,
  quarterOf,
  nextQuarter,
  quartersEndingAt,
} from "./quarters";

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

describe("quarter lists", () => {
  it("lists quarters oldest first across a year end", () => {
    const list = quartersEndingAt(quarterOf("2027-02-10"), 3);
    expect(list.map((q) => q.key)).toEqual(["2026-Q3", "2026-Q4", "2027-Q1"]);
    expect(nextQuarter(quarterOf("2026-12-31")).key).toBe("2027-Q1");
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
