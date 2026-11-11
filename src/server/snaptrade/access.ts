/**
 * Getting a working access token, and what to do when one stops working.
 *
 * SnapTrade access tokens last ten hours and refresh tokens rotate on every
 * use: the moment one is spent, only the new one works. So a refresh is
 * claimed first, so that two requests never spend the same token, and the
 * new pair is saved before anything else happens.
 *
 * On a 401 the token is refreshed once and the call retried once. If that
 * also fails, the person is asked to reconnect and their rank is paused.
 */

import { GrantRejected, type TokenSet } from "./oauth";

export type StoredTokens = {
  accessToken: string;
  refreshToken: string;
  accessExpiresAt: number;
  status: string;
};

export interface TokenStore {
  load(): Promise<StoredTokens | null>;
  /** Marks a refresh as in flight. False if another request got there first. */
  claimRefresh(current: StoredTokens): Promise<boolean>;
  /** Saves a rotated pair and clears the in-flight mark, in one write. */
  save(tokens: TokenSet): Promise<void>;
  /** Clears the in-flight mark after a failure that did not spend the token. */
  release(): Promise<void>;
  /** Records that the person has to sign in again. */
  markReconnect(): Promise<void>;
}

/** The API answered 401 for this access token. */
export class Unauthorized extends Error {
  constructor() {
    super("SnapTrade answered 401");
    this.name = "Unauthorized";
  }
}

/** Nothing more can be done without the person signing in again. */
export class ReconnectNeeded extends Error {
  constructor() {
    super("SnapTrade connection needs to be reconnected");
    this.name = "ReconnectNeeded";
  }
}

const EXPIRY_MARGIN_MS = 5 * 60_000;

export type AccessOptions = {
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

async function refresh(
  store: TokenStore,
  current: StoredTokens,
  doRefresh: (refreshToken: string) => Promise<TokenSet>,
  options: Required<AccessOptions>,
): Promise<StoredTokens> {
  if (!(await store.claimRefresh(current))) {
    // Another request is refreshing. Wait for its result instead of spending
    // the same refresh token a second time.
    for (let attempt = 0; attempt < 6; attempt++) {
      await options.sleep(400);
      const latest = await store.load();
      if (!latest || latest.status === "needs_reconnect") throw new ReconnectNeeded();
      if (latest.status === "active" && latest.refreshToken !== current.refreshToken) {
        return latest;
      }
    }
    throw new Error("Token refresh is still in progress");
  }
  let tokens: TokenSet;
  try {
    tokens = await doRefresh(current.refreshToken);
  } catch (error) {
    if (error instanceof GrantRejected) {
      await store.markReconnect();
      throw new ReconnectNeeded();
    }
    await store.release();
    throw error;
  }
  // The old refresh token is spent, so this pair is the only one that works.
  // A save that fails is tried again before giving up.
  for (let attempt = 1; ; attempt++) {
    try {
      await store.save(tokens);
      break;
    } catch (error) {
      if (attempt >= 3) throw error;
      await options.sleep(150 * attempt);
    }
  }
  return {
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    accessExpiresAt: options.now() + tokens.expiresIn * 1000,
    status: "active",
  };
}

/**
 * Runs `call` with a valid access token. `call` should throw `Unauthorized`
 * when the API answers 401.
 */
export async function withAccessToken<T>(
  store: TokenStore,
  doRefresh: (refreshToken: string) => Promise<TokenSet>,
  call: (accessToken: string) => Promise<T>,
  options: AccessOptions = {},
): Promise<T> {
  const opts = {
    now: options.now ?? Date.now,
    sleep: options.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms))),
  };
  let tokens = await store.load();
  if (!tokens || tokens.status === "needs_reconnect") throw new ReconnectNeeded();
  if (tokens.status !== "active" || tokens.accessExpiresAt - opts.now() < EXPIRY_MARGIN_MS) {
    tokens = await refresh(store, tokens, doRefresh, opts);
  }
  try {
    return await call(tokens.accessToken);
  } catch (error) {
    if (!(error instanceof Unauthorized)) throw error;
  }
  // One refresh, one retry.
  tokens = await refresh(store, tokens, doRefresh, opts);
  try {
    return await call(tokens.accessToken);
  } catch (error) {
    if (!(error instanceof Unauthorized)) throw error;
    await store.markReconnect();
    throw new ReconnectNeeded();
  }
}
