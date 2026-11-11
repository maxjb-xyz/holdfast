import "server-only";
import { safeEqual, sha256Hex } from "./crypto";

/**
 * The secret the scheduled job uses to call the sync route. Derived from the
 * encryption key, so there is no extra secret to set up.
 */
export function cronSecret(encryptionKey: string): Promise<string> {
  return sha256Hex(`holdfast-cron:${encryptionKey}`);
}

export async function isCronRequest(
  authorization: string | null,
  encryptionKey: string,
): Promise<boolean> {
  if (!authorization?.startsWith("Bearer ")) return false;
  return safeEqual(authorization.slice(7), await cronSecret(encryptionKey));
}
