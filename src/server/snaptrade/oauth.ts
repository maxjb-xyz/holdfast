/**
 * SnapTrade OAuth 2.0 with OpenID Connect: authorization code with PKCE.
 * The client secret and all tokens stay on the server.
 *
 * Endpoints and rules follow https://docs.snaptrade.com/docs/oauth-apps
 */

import { fromBase64, safeEqual } from "../crypto";

export const ISSUER = "https://api.snaptrade.com";
export const AUTHORIZE_URL = "https://dashboard.snaptrade.com/oauth/authorize";
export const TOKEN_URL = "https://api.snaptrade.com/oauth/token/";
export const REVOKE_URL = "https://api.snaptrade.com/oauth/revoke_token/";
export const JWKS_URL = "https://api.snaptrade.com/.well-known/jwks.json";

/** Read-only. Holdfast never asks for `trade`. */
export const SCOPES = "openid profile read";

export type Client = { clientId: string; clientSecret: string; redirectUri: string };
export type Fetch = typeof fetch;

export type TokenSet = {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires. SnapTrade issues 10 hours. */
  expiresIn: number;
  scope: string;
  idToken: string | null;
};

/** Thrown when SnapTrade rejects a grant: the user has to sign in again. */
export class GrantRejected extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GrantRejected";
  }
}

export function authorizeUrl(
  client: Client,
  attempt: { state: string; nonce: string; challenge: string },
): string {
  const url = new URL(AUTHORIZE_URL);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: client.clientId,
    redirect_uri: client.redirectUri,
    scope: SCOPES,
    state: attempt.state,
    nonce: attempt.nonce,
    code_challenge: attempt.challenge,
    code_challenge_method: "S256",
  }).toString();
  return url.toString();
}

function basicAuth(client: Client): string {
  return `Basic ${btoa(`${encodeURIComponent(client.clientId)}:${encodeURIComponent(client.clientSecret)}`)}`;
}

async function tokenRequest(
  client: Client,
  body: Record<string, string>,
  fetchImpl: Fetch,
): Promise<TokenSet> {
  const response = await fetchImpl(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(client),
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: new URLSearchParams(body).toString(),
  });
  if (response.status >= 400 && response.status < 500) {
    let error: string | null = null;
    let readable = false;
    try {
      const body = (await response.json()) as { error?: unknown };
      readable = body !== null && typeof body === "object";
      error = typeof body.error === "string" ? body.error : null;
    } catch {
      readable = false;
    }
    // Only a rejected code or refresh token means the person must sign in
    // again. A wrong client secret, a malformed request, a rate limit or an
    // error page from something in between is this app's problem, and must
    // not sign everyone out.
    const ours = [
      "invalid_client",
      "invalid_request",
      "unauthorized_client",
      "unsupported_grant_type",
      "invalid_scope",
    ];
    const rejected =
      error === "invalid_grant" ||
      (response.status === 400 && readable && !ours.includes(error ?? ""));
    if (rejected) {
      throw new GrantRejected(`Token endpoint answered ${response.status}`);
    }
    throw new Error(
      `Token endpoint answered ${response.status}${error ? ` (${error})` : ""}`,
    );
  }
  if (!response.ok) {
    throw new Error(`Token endpoint answered ${response.status}`);
  }
  const json = (await response.json()) as Record<string, unknown>;
  if (typeof json.access_token !== "string" || typeof json.refresh_token !== "string") {
    throw new Error("Token response is missing tokens");
  }
  return {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    expiresIn: typeof json.expires_in === "number" ? json.expires_in : 36_000,
    scope: typeof json.scope === "string" ? json.scope : "",
    idToken: typeof json.id_token === "string" ? json.id_token : null,
  };
}

export function exchangeCode(
  client: Client,
  code: string,
  codeVerifier: string,
  fetchImpl: Fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    client,
    {
      grant_type: "authorization_code",
      code,
      code_verifier: codeVerifier,
      redirect_uri: client.redirectUri,
    },
    fetchImpl,
  );
}

/**
 * Trades a refresh token for a new pair. SnapTrade rotates refresh tokens:
 * the one passed in stops working, so the caller must save the new one at once.
 */
export function refreshTokens(
  client: Client,
  refreshToken: string,
  fetchImpl: Fetch = fetch,
): Promise<TokenSet> {
  return tokenRequest(
    client,
    { grant_type: "refresh_token", refresh_token: refreshToken },
    fetchImpl,
  );
}

/** Revokes Holdfast's access. Used when a person deletes their data. */
export async function revokeToken(
  client: Client,
  refreshToken: string,
  fetchImpl: Fetch = fetch,
): Promise<boolean> {
  const response = await fetchImpl(REVOKE_URL, {
    method: "POST",
    headers: {
      Authorization: basicAuth(client),
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      token: refreshToken,
      token_type_hint: "refresh_token",
    }).toString(),
  });
  return response.ok;
}

export type Identity = { sub: string; name: string | null };

type Jwk = JsonWebKey & { kid?: string };
let jwksCache: { keys: Jwk[]; fetchedAt: number } | null = null;

async function signingKeys(fetchImpl: Fetch, force: boolean): Promise<Jwk[]> {
  if (!force && jwksCache && Date.now() - jwksCache.fetchedAt < 3_600_000) {
    return jwksCache.keys;
  }
  const response = await fetchImpl(JWKS_URL, { headers: { Accept: "application/json" } });
  if (!response.ok) throw new Error(`JWKS endpoint answered ${response.status}`);
  const json = (await response.json()) as { keys?: Jwk[] };
  jwksCache = { keys: json.keys ?? [], fetchedAt: Date.now() };
  return jwksCache.keys;
}

function decodeSegment(segment: string): Record<string, unknown> {
  return JSON.parse(new TextDecoder().decode(fromBase64(segment))) as Record<string, unknown>;
}

/**
 * Verifies an ID token and returns who signed in. Checks the RS256 signature
 * against SnapTrade's published keys, then issuer, audience, expiry, issue
 * time and the nonce this sign-in attempt started with.
 */
export async function verifyIdToken(
  idToken: string,
  expected: { clientId: string; nonce: string; now?: number },
  fetchImpl: Fetch = fetch,
): Promise<Identity> {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new Error("ID token is malformed");
  const header = decodeSegment(parts[0]);
  const claims = decodeSegment(parts[1]);
  if (header.alg !== "RS256") throw new Error("ID token uses an unexpected algorithm");

  const find = (keys: Jwk[]) => keys.find((k) => k.kid === header.kid && k.kty === "RSA");
  // An unknown key id may mean SnapTrade rotated keys: fetch them again once.
  const jwk = find(await signingKeys(fetchImpl, false)) ?? find(await signingKeys(fetchImpl, true));
  if (!jwk) throw new Error("ID token was signed with an unknown key");

  const key = await crypto.subtle.importKey(
    "jwk",
    { kty: jwk.kty, n: jwk.n, e: jwk.e, alg: "RS256", ext: true },
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["verify"],
  );
  const valid = await crypto.subtle.verify(
    "RSASSA-PKCS1-v1_5",
    key,
    fromBase64(parts[2]),
    new TextEncoder().encode(`${parts[0]}.${parts[1]}`),
  );
  if (!valid) throw new Error("ID token signature is invalid");

  const now = Math.floor((expected.now ?? Date.now()) / 1000);
  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (claims.iss !== ISSUER) throw new Error("ID token has the wrong issuer");
  if (!audience.includes(expected.clientId)) throw new Error("ID token is for another app");
  if (typeof claims.exp !== "number" || claims.exp <= now - 60) throw new Error("ID token has expired");
  if (typeof claims.iat !== "number" || claims.iat > now + 300 || claims.iat < now - 3600) {
    throw new Error("ID token has an implausible issue time");
  }
  if (typeof claims.nonce !== "string" || !safeEqual(claims.nonce, expected.nonce)) {
    throw new Error("ID token nonce does not match this sign-in");
  }
  if (typeof claims.sub !== "string" || claims.sub.length === 0) {
    throw new Error("ID token has no subject");
  }
  return {
    sub: claims.sub,
    name: typeof claims.name === "string" && claims.name.trim() ? claims.name.trim() : null,
  };
}

/** Test hook: forget cached signing keys. */
export function clearJwksCache(): void {
  jwksCache = null;
}
