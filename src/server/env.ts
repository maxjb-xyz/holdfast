import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";

type Vars = {
  APP_URL?: string;
  SNAPTRADE_CLIENT_ID?: string;
  SNAPTRADE_CLIENT_SECRET?: string;
  TOKEN_ENCRYPTION_KEY?: string;
};

async function vars(): Promise<Vars> {
  const { env } = await getCloudflareContext({ async: true });
  return env as unknown as Vars;
}

export type SnapTradeConfig = {
  clientId: string;
  clientSecret: string;
  encryptionKey: string;
  redirectUri: string;
};

/**
 * Everything SnapTrade sign-in needs, or null when the deployment has not
 * been given its secrets yet. Without them the app still runs the demo league.
 */
export async function snaptradeConfig(): Promise<SnapTradeConfig | null> {
  const v = await vars();
  if (
    !v.APP_URL ||
    !v.SNAPTRADE_CLIENT_ID ||
    !v.SNAPTRADE_CLIENT_SECRET ||
    !v.TOKEN_ENCRYPTION_KEY
  ) {
    return null;
  }
  return {
    clientId: v.SNAPTRADE_CLIENT_ID,
    clientSecret: v.SNAPTRADE_CLIENT_SECRET,
    encryptionKey: v.TOKEN_ENCRYPTION_KEY,
    // Must match the redirect URI registered with SnapTrade exactly.
    redirectUri: `${v.APP_URL.replace(/\/+$/, "")}/api/auth/callback`,
  };
}

export async function encryptionKey(): Promise<string | null> {
  return (await vars()).TOKEN_ENCRYPTION_KEY ?? null;
}

/** The public address of this deployment, without a trailing slash. */
export async function appUrl(): Promise<string | null> {
  const url = (await vars()).APP_URL;
  return url ? url.replace(/\/+$/, "") : null;
}
