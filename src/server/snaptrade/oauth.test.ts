import { beforeEach, describe, expect, it } from "vitest";
import {
  base64url,
  pkceChallenge,
  seal,
  unseal,
  safeEqual,
  sha256Hex,
} from "../crypto";
import {
  GrantRejected,
  ISSUER,
  JWKS_URL,
  TOKEN_URL,
  authorizeUrl,
  clearJwksCache,
  exchangeCode,
  refreshTokens,
  verifyIdToken,
} from "./oauth";

const client = {
  clientId: "client-1",
  clientSecret: "s3cret",
  redirectUri: "https://holdfast.example/api/auth/callback",
};
const encoder = new TextEncoder();
const NOW = Date.parse("2026-11-11T12:00:00Z");

async function keyPair() {
  return crypto.subtle.generateKey(
    {
      name: "RSASSA-PKCS1-v1_5",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    true,
    ["sign", "verify"],
  );
}

async function signToken(
  key: CryptoKey,
  claims: object,
  header: object = { alg: "RS256", kid: "k1" },
) {
  const head = base64url(encoder.encode(JSON.stringify(header)));
  const body = base64url(encoder.encode(JSON.stringify(claims)));
  const sig = await crypto.subtle.sign(
    "RSASSA-PKCS1-v1_5",
    key,
    encoder.encode(`${head}.${body}`),
  );
  return `${head}.${body}.${base64url(new Uint8Array(sig))}`;
}

const goodClaims = (over: object = {}) => ({
  iss: ISSUER,
  sub: "user-uuid",
  aud: "client-1",
  exp: NOW / 1000 + 600,
  iat: NOW / 1000 - 5,
  nonce: "nonce-1",
  name: "Maximus B",
  ...over,
});

describe("authorizeUrl", () => {
  it("asks for read-only scopes with PKCE, state and nonce", () => {
    const url = new URL(
      authorizeUrl(client, { state: "st", nonce: "no", challenge: "ch" }),
    );
    expect(url.origin + url.pathname).toBe(
      "https://dashboard.snaptrade.com/oauth/authorize",
    );
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-1",
      redirect_uri: client.redirectUri,
      scope: "openid profile read",
      state: "st",
      nonce: "no",
      code_challenge: "ch",
      code_challenge_method: "S256",
    });
    expect(url.searchParams.get("scope")).not.toContain("trade");
  });

  it("derives the S256 challenge from the verifier", async () => {
    // Test vector from RFC 7636, appendix B.
    expect(
      await pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk"),
    ).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });
});

describe("token requests", () => {
  it("exchanges a code with Basic auth and the verifier", async () => {
    let seen: { url: string; init: RequestInit } | null = null;
    const fake = (async (url: string, init: RequestInit) => {
      seen = { url, init };
      return Response.json({
        access_token: "a",
        refresh_token: "r",
        expires_in: 36000,
        scope: "openid read",
        id_token: "x.y.z",
      });
    }) as unknown as typeof fetch;
    const tokens = await exchangeCode(client, "the-code", "the-verifier", fake);
    expect(tokens).toEqual({
      accessToken: "a",
      refreshToken: "r",
      expiresIn: 36000,
      scope: "openid read",
      idToken: "x.y.z",
    });
    expect(seen!.url).toBe(TOKEN_URL);
    const headers = seen!.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe(`Basic ${btoa("client-1:s3cret")}`);
    expect(
      Object.fromEntries(new URLSearchParams(seen!.init.body as string)),
    ).toEqual({
      grant_type: "authorization_code",
      code: "the-code",
      code_verifier: "the-verifier",
      redirect_uri: client.redirectUri,
    });
  });

  it("treats a rejected refresh as needing a new sign-in, and a server error as retryable", async () => {
    const rejected = (async () =>
      Response.json(
        { error: "invalid_grant" },
        { status: 400 },
      )) as unknown as typeof fetch;
    await expect(refreshTokens(client, "old", rejected)).rejects.toBeInstanceOf(
      GrantRejected,
    );
    for (const [status, body] of [
      [401, { error: "invalid_client" }],
      [429, { error: "rate_limited" }],
      [400, { error: "invalid_request" }],
    ] as const) {
      const ours = (async () =>
        Response.json(body, { status })) as unknown as typeof fetch;
      const failure = await refreshTokens(client, "old", ours).catch(
        (e: unknown) => e,
      );
      expect(failure).toBeInstanceOf(Error);
      expect(failure).not.toBeInstanceOf(GrantRejected);
    }
    const page = (async () =>
      new Response("<html>Bad Request</html>", {
        status: 400,
      })) as unknown as typeof fetch;
    const notJson = await refreshTokens(client, "old", page).catch(
      (e: unknown) => e,
    );
    expect(notJson).toBeInstanceOf(Error);
    expect(notJson).not.toBeInstanceOf(GrantRejected);
    const down = (async () =>
      new Response("oops", { status: 503 })) as unknown as typeof fetch;
    const error = await refreshTokens(client, "old", down).catch(
      (e: unknown) => e,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error).not.toBeInstanceOf(GrantRejected);
  });

  it("refuses a response without tokens", async () => {
    const empty = (async () => Response.json({})) as unknown as typeof fetch;
    await expect(refreshTokens(client, "old", empty)).rejects.toThrow(
      "missing tokens",
    );
  });
});

describe("verifyIdToken", () => {
  let pair: CryptoKeyPair;
  let jwks: typeof fetch;
  let fetches = 0;

  beforeEach(async () => {
    clearJwksCache();
    fetches = 0;
    pair = await keyPair();
    const jwk = await crypto.subtle.exportKey("jwk", pair.publicKey);
    jwks = (async (url: string) => {
      expect(url).toBe(JWKS_URL);
      fetches++;
      return Response.json({ keys: [{ ...jwk, kid: "k1" }] });
    }) as unknown as typeof fetch;
  });

  const verify = (token: string) =>
    verifyIdToken(
      token,
      { clientId: "client-1", nonce: "nonce-1", now: NOW },
      jwks,
    );

  it("accepts a well-formed token and returns the subject and name", async () => {
    expect(
      await verify(await signToken(pair.privateKey, goodClaims())),
    ).toEqual({ sub: "user-uuid", name: "Maximus B" });
  });

  it("caches signing keys between sign-ins", async () => {
    await verify(await signToken(pair.privateKey, goodClaims()));
    await verify(await signToken(pair.privateKey, goodClaims()));
    expect(fetches).toBe(1);
  });

  it("rejects a token signed by someone else", async () => {
    const other = await keyPair();
    await expect(
      verify(await signToken(other.privateKey, goodClaims())),
    ).rejects.toThrow("signature");
  });

  it("rejects a tampered payload", async () => {
    const token = await signToken(pair.privateKey, goodClaims());
    const [h, , s] = token.split(".");
    const forged = `${h}.${base64url(encoder.encode(JSON.stringify(goodClaims({ sub: "someone-else" }))))}.${s}`;
    await expect(verify(forged)).rejects.toThrow("signature");
  });

  it("rejects unsigned and wrong-algorithm tokens", async () => {
    const none = await signToken(pair.privateKey, goodClaims(), {
      alg: "none",
      kid: "k1",
    });
    await expect(verify(none)).rejects.toThrow("algorithm");
    const hs = await signToken(pair.privateKey, goodClaims(), {
      alg: "HS256",
      kid: "k1",
    });
    await expect(verify(hs)).rejects.toThrow("algorithm");
  });

  it("rejects the wrong issuer, audience, nonce, expiry and subject", async () => {
    const cases: [object, string][] = [
      [{ iss: "https://evil.example" }, "issuer"],
      [{ aud: "another-app" }, "another app"],
      [{ nonce: "replayed" }, "nonce"],
      [{ exp: NOW / 1000 - 3600 }, "expired"],
      [{ iat: NOW / 1000 - 86400 }, "issue time"],
      [{ sub: "" }, "subject"],
    ];
    for (const [over, message] of cases) {
      await expect(
        verify(await signToken(pair.privateKey, goodClaims(over))),
      ).rejects.toThrow(message);
    }
  });

  it("fetches keys again once when the key id is unknown, then gives up", async () => {
    const token = await signToken(pair.privateKey, goodClaims(), {
      alg: "RS256",
      kid: "rotated",
    });
    await expect(verify(token)).rejects.toThrow("unknown key");
    expect(fetches).toBe(2);
  });
});

describe("crypto helpers", () => {
  const key = base64url(new Uint8Array(32).fill(7));

  it("seals and unseals a token", async () => {
    const sealed = await seal("refresh-token-value", key, "user-1");
    expect(sealed).not.toContain("refresh-token-value");
    expect(await unseal(sealed, key, "user-1")).toBe("refresh-token-value");
  });

  it("uses a fresh nonce every time", async () => {
    expect(await seal("same", key, "u")).not.toBe(await seal("same", key, "u"));
  });

  it("will not unseal for another user, with another key, or after tampering", async () => {
    const sealed = await seal("secret", key, "user-1");
    await expect(unseal(sealed, key, "user-2")).rejects.toThrow();
    await expect(
      unseal(sealed, base64url(new Uint8Array(32).fill(8)), "user-1"),
    ).rejects.toThrow();
    const [v, iv, data] = sealed.split(".");
    // Changes the second-to-last character, whatever it was.
    const flipped =
      data.slice(0, -2) + (data.at(-2) === "A" ? "B" : "A") + data.slice(-1);
    await expect(
      unseal(`${v}.${iv}.${flipped}`, key, "user-1"),
    ).rejects.toThrow();
  });

  it("refuses a key of the wrong length", async () => {
    await expect(seal("x", base64url(new Uint8Array(16)), "u")).rejects.toThrow(
      "32 bytes",
    );
  });

  it("compares strings safely and hashes to hex", async () => {
    expect(safeEqual("abc", "abc")).toBe(true);
    expect(safeEqual("abc", "abd")).toBe(false);
    expect(safeEqual("abc", "abcd")).toBe(false);
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
    );
  });
});
