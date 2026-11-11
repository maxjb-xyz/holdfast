import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { parseShareCard, type ShareCard } from "@/lib/share";
import { base64url, fromBase64, safeEqual } from "./crypto";

/**
 * Share links carry the card itself, signed, so a shared card needs no
 * database row and cannot be edited by changing the link.
 */

const encoder = new TextEncoder();

async function signingKey(): Promise<CryptoKey> {
  const { env } = await getCloudflareContext({ async: true });
  const secret =
    (env as unknown as Record<string, string | undefined>)
      .TOKEN_ENCRYPTION_KEY ||
    // Without the secret only the demo runs, and demo cards are not private.
    "holdfast-demo-share-key";
  return crypto.subtle.importKey(
    "raw",
    encoder.encode(`share:${secret}`),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
}

async function sign(payload: string): Promise<string> {
  const mac = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    encoder.encode(payload),
  );
  return base64url(new Uint8Array(mac)).slice(0, 32);
}

export async function shareToken(card: ShareCard): Promise<string> {
  const payload = base64url(encoder.encode(JSON.stringify(card)));
  return `${payload}.${await sign(payload)}`;
}

export async function readShareToken(token: string): Promise<ShareCard | null> {
  const [payload, mac] = token.split(".");
  if (!payload || !mac || token.length > 4000) return null;
  if (!safeEqual(mac, await sign(payload))) return null;
  try {
    return parseShareCard(
      JSON.parse(new TextDecoder().decode(fromBase64(payload))),
    );
  } catch {
    return null;
  }
}
