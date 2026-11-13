import { describe, expect, it } from "vitest";
import { closeRequests, plausibleClose } from "./baselines";

const TODAY = "2026-11-13";
const pos = (symbol: string, units: number, price: number, extra = {}) => ({
  symbol,
  units,
  price,
  cashEquivalent: false,
  ...extra,
});

describe("closeRequests", () => {
  it("asks for the last close before the quarter for a holding older than it", () => {
    const requests = closeRequests({
      activities: [],
      positions: [pos("VTI", 2, 300, { quoteSymbol: "VTI", currency: "USD" })],
      firstSeen: { VTI: "2025-03-01" },
      startPriceDays: { VTI: "2026-11-12" },
      closeLookups: {},
      today: TODAY,
    });
    expect(requests).toEqual([
      {
        symbol: "VTI",
        on: "2026-09-30",
        from: "2026-10-01",
        price: 300,
        quoteSymbol: "VTI",
        currency: "USD",
      },
    ]);
  });

  it("asks for the close on the day a holding was bought mid-quarter", () => {
    const requests = closeRequests({
      activities: [
        {
          type: "BUY",
          date: "2026-10-20",
          amount: 100,
          units: 1,
          symbol: "NEW",
        },
      ],
      positions: [pos("NEW", 1, 120)],
      firstSeen: { NEW: "2026-11-12" },
      startPriceDays: { NEW: "2026-11-12" },
      closeLookups: {},
      today: TODAY,
    });
    expect(requests).toMatchObject([
      {
        symbol: "NEW",
        on: "2026-10-20",
        from: "2026-10-20",
        quoteSymbol: "NEW",
      },
    ]);
  });

  it("asks for nothing it already has, cash, or anything opened today", () => {
    expect(
      closeRequests({
        activities: [],
        positions: [
          pos("VTI", 2, 300),
          { ...pos("SPAXX", 100, 1), cashEquivalent: true },
          pos("TODAY", 1, 5),
        ],
        firstSeen: { VTI: "2025-03-01", SPAXX: "2025-03-01", TODAY },
        startPriceDays: { VTI: "2026-10-01", TODAY },
        closeLookups: { VTI: "2026-09-30" },
        today: TODAY,
      }),
    ).toEqual([]);
  });

  it("asks on the quarter's second day for the close before it, once", () => {
    const base = {
      activities: [],
      positions: [pos("VTI", 2, 300)],
      firstSeen: { VTI: "2025-03-01" },
      // The quarter's first sync took its own price on day one.
      startPriceDays: { VTI: "2026-10-01" },
      today: "2026-10-02",
    };
    expect(closeRequests({ ...base, closeLookups: {} })).toMatchObject([
      { symbol: "VTI", on: "2026-09-30", from: "2026-10-01" },
    ]);
    // Asked already, found or not: not again.
    expect(
      closeRequests({ ...base, closeLookups: { VTI: "2026-09-30" } }),
    ).toEqual([]);
  });

  it("puts the largest holdings first and caps the lookups", () => {
    const positions = Array.from({ length: 14 }, (_, i) =>
      pos(`S${i}`, 1, i + 1),
    );
    const requests = closeRequests({
      activities: [],
      positions,
      firstSeen: Object.fromEntries(
        positions.map((p) => [p.symbol, "2025-01-01"]),
      ),
      startPriceDays: {},
      closeLookups: {},
      today: TODAY,
    });
    expect(requests).toHaveLength(10);
    expect(requests[0].symbol).toBe("S13");
  });
});

describe("plausibleClose", () => {
  it("rejects closes far from today's price", () => {
    expect(plausibleClose(95, 100)).toBe(true);
    expect(plausibleClose(10, 100)).toBe(false);
    expect(plausibleClose(0, 100)).toBe(false);
  });
});
