import { describe, expect, it } from "vitest";
import { Unauthorized } from "./access";
import { SnapTradeApi } from "./api";

function apiAnswering(status: number, body: unknown) {
  const calls: { url: string; auth: string | null }[] = [];
  const api = new SnapTradeApi("token-1", async (input, init) => {
    calls.push({
      url: String(input),
      auth: new Headers(init?.headers).get("Authorization"),
    });
    return new Response(JSON.stringify(body), { status });
  });
  return { api, calls };
}

describe("SnapTradeApi.balanceHistory", () => {
  it("reads the estimated daily values", async () => {
    const { api, calls } = apiAnswering(200, {
      currency: "USD",
      history: [
        { date: "2026-01-01", total_value: "15363.23" },
        { date: "2026-01-02T00:00:00Z", total_value: 15400 },
        { date: "2026-01-03", total_value: "n/a" },
        { total_value: "1" },
      ],
    });
    expect(await api.balanceHistory("acc/1")).toEqual([
      { date: "2026-01-01", value: 15363.23 },
      { date: "2026-01-02", value: 15400 },
    ]);
    expect(calls).toEqual([
      { url: "https://api.snaptrade.com/accounts/acc%2F1/balanceHistory", auth: "Bearer token-1" },
    ]);
  });

  it("answers null when the feature is not switched on", async () => {
    const { api } = apiAnswering(403, {
      detail: "Feature is not enabled for this customer or this connection",
      default_code: 1141,
    });
    expect(await api.balanceHistory("a1")).toBeNull();
  });

  it("treats an unexpected body as an empty history", async () => {
    const { api } = apiAnswering(200, []);
    expect(await api.balanceHistory("a1")).toEqual([]);
  });

  it("passes on an expired token and other failures", async () => {
    await expect(apiAnswering(401, {}).api.balanceHistory("a1")).rejects.toBeInstanceOf(Unauthorized);
    await expect(apiAnswering(500, {}).api.balanceHistory("a1")).rejects.toThrow("500");
  });
});
