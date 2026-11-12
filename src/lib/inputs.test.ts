import { describe, expect, it } from "vitest";
import { cleanLeagueName, cleanStartDate, inviteCodeFrom, safeReturnTo } from "./inputs";

describe("cleanLeagueName", () => {
  it("trims and collapses spaces", () => {
    expect(cleanLeagueName("  Sunday   Compounders ")).toBe(
      "Sunday Compounders",
    );
  });
  it("rejects empty and invisible names", () => {
    expect(cleanLeagueName("   ")).toBeNull();
    expect(cleanLeagueName("\u200b\u202e\n")).toBeNull();
  });
  it("strips angle brackets and control characters", () => {
    expect(cleanLeagueName("<b>Hi</b>\u0007")).toBe("b Hi /b");
  });
  it("caps the length", () => {
    expect(cleanLeagueName("x".repeat(100))).toHaveLength(40);
  });
});

describe("inviteCodeFrom", () => {
  it("accepts a bare code", () => {
    expect(inviteCodeFrom(" abcDEF12_-xy ")).toBe("abcDEF12_-xy");
  });
  it("accepts a whole link, with or without extras", () => {
    expect(inviteCodeFrom("https://holdfast.example/join/abcDEF12xy")).toBe(
      "abcDEF12xy",
    );
    expect(
      inviteCodeFrom("https://holdfast.example/join/abcDEF12xy/?x=1#top"),
    ).toBe("abcDEF12xy");
  });
  it("rejects other text", () => {
    expect(inviteCodeFrom("short")).toBeNull();
    expect(inviteCodeFrom("https://evil.example/other/abcDEF12xy")).toBeNull();
    expect(inviteCodeFrom("has spaces in it here")).toBeNull();
  });
});

describe("safeReturnTo", () => {
  it("accepts paths inside the app", () => {
    expect(safeReturnTo("/join/abcDEF12xy")).toBe("/join/abcDEF12xy");
    expect(safeReturnTo("/leagues")).toBe("/leagues");
  });
  it("rejects anything that could leave the app", () => {
    for (const bad of [
      "//evil.example",
      "https://evil.example",
      "/\\evil.example",
      "/api/auth/start",
      "/a@b",
      "/%2F%2Fevil.example",
      "javascript:alert(1)",
      "",
      null,
      "/" + "a".repeat(300),
    ]) {
      expect(safeReturnTo(bad)).toBeNull();
    }
  });
});

describe("cleanStartDate", () => {
  const today = "2026-11-12";
  it("accepts a day in the past year", () => {
    expect(cleanStartDate("2026-10-01", today)).toBe("2026-10-01");
    expect(cleanStartDate(" 2025-11-12 ", today)).toBe("2025-11-12");
    expect(cleanStartDate("2026-11-11", today)).toBe("2026-11-11");
  });
  it("treats today, the future and anything older than a year as starting today", () => {
    expect(cleanStartDate(today, today)).toBeNull();
    expect(cleanStartDate("2026-11-13", today)).toBeNull();
    expect(cleanStartDate("2025-11-11", today)).toBeNull();
  });
  it("rejects anything that is not a real day", () => {
    for (const raw of ["", null, undefined, "2026-02-30", "2026-13-01", "10/01/2026", "2026-10-01T00:00", "x"]) {
      expect(cleanStartDate(raw, today)).toBeNull();
    }
  });
});

describe("cleanDisplayName", () => {
  it("trims, strips markup characters and caps the length", async () => {
    const { cleanDisplayName, DISPLAY_NAME_MAX } = await import("./inputs");
    expect(cleanDisplayName("  Max <b> B.  ")).toBe("Max b B.");
    expect(cleanDisplayName(" ​ ")).toBeNull();
    expect(cleanDisplayName("x".repeat(90))?.length).toBe(DISPLAY_NAME_MAX);
  });
});

describe("pickNotice", () => {
  const table = { done: "Done." };
  it("finds the table's own keys only", async () => {
    const { pickNotice } = await import("./inputs");
    expect(pickNotice(table, "done")).toBe("Done.");
    expect(pickNotice(table, "__proto__")).toBeUndefined();
    expect(pickNotice(table, "toString")).toBeUndefined();
    expect(pickNotice(table, ["done"])).toBeUndefined();
    expect(pickNotice(table, undefined)).toBeUndefined();
  });
});
