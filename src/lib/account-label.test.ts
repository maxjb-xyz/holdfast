import { describe, expect, it } from "vitest";
import { accountLabel } from "./account-label";

const none = { institution: null, name: null, rawType: null, lastFour: null };

describe("accountLabel", () => {
  it("joins the brokerage, the account name and the last four digits", () => {
    expect(
      accountLabel({ institution: "Fidelity", name: "Roth IRA", rawType: "IRA", lastFour: "8443" }),
    ).toBe("Fidelity Roth IRA ··8443");
  });

  it("does not repeat a brokerage the name already carries", () => {
    expect(
      accountLabel({ ...none, institution: "Robinhood", name: "Robinhood Individual" }),
    ).toBe("Robinhood Individual");
  });

  it("falls back to the account type when there is no name", () => {
    expect(
      accountLabel({ ...none, institution: "Schwab", rawType: "Margin", lastFour: "0091" }),
    ).toBe("Schwab Margin ··0091");
  });

  it("does not repeat digits the name already shows", () => {
    expect(
      accountLabel({ ...none, institution: "Vanguard", name: "Brokerage 8443", lastFour: "8443" }),
    ).toBe("Vanguard Brokerage 8443");
  });

  it("still tells accounts apart when only the number is known", () => {
    expect(accountLabel({ ...none, lastFour: "1234" })).toBe("Account ··1234");
    expect(accountLabel(none)).toBe("Account");
  });

  it("keeps a very long name inside the column", () => {
    const label = accountLabel({ ...none, name: "x".repeat(200), lastFour: "1234" });
    expect(label.length).toBeLessThanOrEqual(60);
    expect(label.endsWith("··1234")).toBe(true);
  });
});
