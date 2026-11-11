import { describe, expect, it } from "vitest";
import {
  ReconnectNeeded,
  Unauthorized,
  withAccessToken,
  type StoredTokens,
  type TokenStore,
} from "./access";
import { GrantRejected, type TokenSet } from "./oauth";

const NOW = 1_800_000_000_000;
const HOUR = 3_600_000;

function memoryStore(initial: Partial<StoredTokens> | null = {}) {
  const log: string[] = [];
  let tokens: StoredTokens | null =
    initial === null
      ? null
      : { accessToken: "a1", refreshToken: "r1", accessExpiresAt: NOW + 5 * HOUR, status: "active", ...initial };
  const store: TokenStore = {
    load: async () => (tokens ? { ...tokens } : null),
    claimRefresh: async (current) => {
      if (!tokens || tokens.status !== "active" || tokens.refreshToken !== current.refreshToken) {
        log.push("claim-lost");
        return false;
      }
      tokens.status = "refreshing";
      log.push("claim");
      return true;
    },
    save: async (t: TokenSet) => {
      tokens = { accessToken: t.accessToken, refreshToken: t.refreshToken, accessExpiresAt: NOW + t.expiresIn * 1000, status: "active" };
      log.push(`save:${t.refreshToken}`);
    },
    release: async () => {
      if (tokens) tokens.status = "active";
      log.push("release");
    },
    markReconnect: async () => {
      if (tokens) tokens.status = "needs_reconnect";
      log.push("reconnect");
    },
  };
  return { store, log, get: () => tokens, set: (t: StoredTokens) => (tokens = t) };
}

let counter = 1;
const rotate = async (): Promise<TokenSet> => {
  counter++;
  return { accessToken: `a${counter}`, refreshToken: `r${counter}`, expiresIn: 36000, scope: "read", idToken: null };
};
const opts = { now: () => NOW, sleep: async () => {} };

describe("withAccessToken", () => {
  it("uses the stored token while it is fresh", async () => {
    const m = memoryStore();
    const used: string[] = [];
    const result = await withAccessToken(m.store, rotate, async (t) => (used.push(t), "ok"), opts);
    expect(result).toBe("ok");
    expect(used).toEqual(["a1"]);
    expect(m.log).toEqual([]);
  });

  it("refreshes ahead of time when the token is about to expire, and saves the rotated pair", async () => {
    const m = memoryStore({ accessExpiresAt: NOW + 60_000 });
    const used: string[] = [];
    await withAccessToken(m.store, rotate, async (t) => (used.push(t), null), opts);
    expect(used).toHaveLength(1);
    expect(used[0]).not.toBe("a1");
    expect(m.log[0]).toBe("claim");
    expect(m.log[1]).toMatch(/^save:r/);
    expect(m.get()?.refreshToken).not.toBe("r1");
    expect(m.get()?.status).toBe("active");
  });

  it("saves the new refresh token before the retry is attempted", async () => {
    const m = memoryStore();
    const order: string[] = [];
    await withAccessToken(
      m.store,
      rotate,
      async (t) => {
        order.push(`call:${t}:stored=${m.get()?.refreshToken}`);
        if (t === "a1") throw new Unauthorized();
        return null;
      },
      opts,
    );
    expect(order[0]).toBe("call:a1:stored=r1");
    expect(order[1]).toMatch(/^call:a\d+:stored=r\d+$/);
    expect(order[1]).not.toContain("stored=r1");
  });

  it("on a 401 refreshes once and retries once", async () => {
    const m = memoryStore();
    let calls = 0;
    let refreshes = 0;
    const result = await withAccessToken(
      m.store,
      async () => (refreshes++, rotate()),
      async () => {
        calls++;
        if (calls === 1) throw new Unauthorized();
        return "second time lucky";
      },
      opts,
    );
    expect(result).toBe("second time lucky");
    expect([calls, refreshes]).toEqual([2, 1]);
    expect(m.get()?.status).toBe("active");
  });

  it("asks for a reconnect when the retry is also refused, without a third try", async () => {
    const m = memoryStore();
    let calls = 0;
    let refreshes = 0;
    const attempt = withAccessToken(
      m.store,
      async () => (refreshes++, rotate()),
      async () => {
        calls++;
        throw new Unauthorized();
      },
      opts,
    );
    await expect(attempt).rejects.toBeInstanceOf(ReconnectNeeded);
    expect([calls, refreshes]).toEqual([2, 1]);
    expect(m.get()?.status).toBe("needs_reconnect");
  });

  it("asks for a reconnect when the refresh token is rejected", async () => {
    const m = memoryStore({ accessExpiresAt: NOW - HOUR });
    const attempt = withAccessToken(m.store, async () => { throw new GrantRejected("invalid_grant"); }, async () => "never", opts);
    await expect(attempt).rejects.toBeInstanceOf(ReconnectNeeded);
    expect(m.log).toEqual(["claim", "reconnect"]);
  });

  it("does not pause anyone over a network failure during refresh", async () => {
    const m = memoryStore({ accessExpiresAt: NOW - HOUR });
    const attempt = withAccessToken(m.store, async () => { throw new Error("socket hang up"); }, async () => "never", opts);
    await expect(attempt).rejects.toThrow("socket hang up");
    expect(m.log).toEqual(["claim", "release"]);
    expect(m.get()).toMatchObject({ status: "active", refreshToken: "r1" });
  });

  it("does not spend the same refresh token twice when two requests race", async () => {
    const m = memoryStore({ accessExpiresAt: NOW - HOUR });
    const spent: string[] = [];
    let finishFirst: (t: TokenSet) => void = () => {};
    const slowRefresh = (rt: string) =>
      new Promise<TokenSet>((resolve) => {
        spent.push(rt);
        finishFirst = resolve;
      });
    const first = withAccessToken(m.store, slowRefresh, async (t) => t, opts);
    await new Promise((r) => setTimeout(r, 0));
    const second = withAccessToken(
      m.store,
      async (rt) => (spent.push(rt), rotate()),
      async (t) => t,
      { now: () => NOW, sleep: async () => finishFirst({ accessToken: "aX", refreshToken: "rX", expiresIn: 36000, scope: "", idToken: null }) },
    );
    expect(await Promise.all([first, second])).toEqual(["aX", "aX"]);
    expect(spent).toEqual(["r1"]);
  });

  it("refuses straight away when a reconnect is already needed or there are no tokens", async () => {
    await expect(withAccessToken(memoryStore({ status: "needs_reconnect" }).store, rotate, async () => 1, opts)).rejects.toBeInstanceOf(ReconnectNeeded);
    await expect(withAccessToken(memoryStore(null).store, rotate, async () => 1, opts)).rejects.toBeInstanceOf(ReconnectNeeded);
  });

  it("passes other errors through untouched", async () => {
    const m = memoryStore();
    await expect(withAccessToken(m.store, rotate, async () => { throw new Error("503 from brokerage"); }, opts)).rejects.toThrow("503");
    expect(m.log).toEqual([]);
  });
});
