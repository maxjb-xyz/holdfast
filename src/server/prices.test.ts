import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@opennextjs/cloudflare", () => ({
  getCloudflareContext: async () => ({ env: { TIINGO_API_KEY: "k" } }),
}));

const { lookUpBaselines } = await import("./prices");
const look = async (rs: Parameters<typeof lookUpBaselines>[0]) =>
  (await lookUpBaselines(rs)).found;

const request = {
  symbol: "VTI",
  quoteSymbol: "VTI",
  on: "2026-09-30",
  from: "2026-10-01",
  price: 300,
  currency: "USD",
};

function yahoo(currency: string, closes: [string, number | null][]) {
  // Bars stamped at 09:30 New York time, with EDT's offset.
  return {
    chart: {
      result: [
        {
          meta: { currency, gmtoffset: -14400 },
          timestamp: closes.map(([d]) => Date.parse(`${d}T13:30:00Z`) / 1000),
          indicators: { quote: [{ close: closes.map(([, c]) => c) }] },
        },
      ],
    },
  };
}

afterEach(() => vi.unstubAllGlobals());

describe("lookUpBaselines", () => {
  it("takes Yahoo's last close on or before the day", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        Response.json(
          yahoo("USD", [
            ["2026-09-29", 280],
            ["2026-09-30", 282],
            ["2026-10-01", null],
          ]),
        ),
      ),
    );
    expect(await look([request])).toEqual({
      VTI: { from: "2026-10-01", price: 282 },
    });
  });

  it("converts pence and rejects other currencies", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(yahoo("GBp", [["2026-09-30", 7000]]))),
    );
    expect(await look([{ ...request, currency: "GBP", price: 72 }])).toEqual({
      VTI: { from: "2026-10-01", price: 70 },
    });
    expect(await look([{ ...request, currency: "CAD" }])).toEqual({});
  });

  it("falls back to Tiingo, adjusting its closes for later splits", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("yahoo")
          ? new Response("busy", { status: 429 })
          : Response.json([
              { date: "2026-09-30T00:00:00.000Z", close: 600, splitFactor: 1 },
              { date: "2026-10-15T00:00:00.000Z", close: 290, splitFactor: 2 },
            ]),
      ),
    );
    expect(await look([request])).toEqual({
      VTI: { from: "2026-10-01", price: 300 },
    });
  });

  it("leaves out what it cannot find or that looks wrong", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json(yahoo("USD", [["2026-09-30", 5]]))),
    );
    expect(await look([{ ...request, currency: undefined }])).toEqual({});
  });

  it("answers many holdings from one batched request", async () => {
    const fetch = vi.fn(async (url: string) => {
      expect(String(url)).toContain("/spark?symbols=VTI,BRK-B,VAB.TO");
      const series = (closes: number[]) => ({
        timestamp: ["2026-09-29", "2026-09-30", "2026-10-01"].map(
          (d) => Date.parse(`${d}T13:30:00Z`) / 1000,
        ),
        close: closes,
      });
      return Response.json({
        VTI: series([280, 282, 290]),
        "BRK-B": series([480, 485, 490]),
        "VAB.TO": series([22, 22.1, 22.2]),
      });
    });
    vi.stubGlobal("fetch", fetch);
    expect(
      await look([
        request,
        { ...request, symbol: "BRK.B", quoteSymbol: "BRK.B", price: 500 },
        {
          ...request,
          symbol: "VAB",
          quoteSymbol: "VAB.TO",
          currency: "CAD",
          price: 23,
        },
      ]),
    ).toEqual({
      VTI: { from: "2026-10-01", price: 282 },
      "BRK.B": { from: "2026-10-01", price: 485 },
      VAB: { from: "2026-10-01", price: 22.1 },
    });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("asks no more than ten one at a time, and says which it asked", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("busy", { status: 429 })),
    );
    const many = Array.from({ length: 30 }, (_, i) => ({
      ...request,
      symbol: `S${i}`,
      quoteSymbol: `S${i}`,
    }));
    const { found, asked } = await lookUpBaselines(many);
    expect(found).toEqual({});
    // Both batch requests failed outright, so those count as not asked
    // (tried again next sync); ten went one at a time.
    expect(asked.size).toBe(10);
    const odd = Array.from({ length: 12 }, (_, i) => ({
      ...request,
      symbol: `X${i}.L`,
      quoteSymbol: `X${i}.L`,
      currency: "GBP",
    }));
    expect((await lookUpBaselines(odd)).asked.size).toBe(10);
  });

  it("ignores a batched close older than the lookback", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string) =>
        String(url).includes("spark")
          ? Response.json({
              VTI: {
                timestamp: [Date.parse("2026-07-01T13:30:00Z") / 1000],
                close: [290],
              },
            })
          : new Response("no", { status: 404 }),
      ),
    );
    expect(await look([request])).toEqual({});
  });
});
