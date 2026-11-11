/**
 * Small WebCrypto helpers. Everything here runs on Cloudflare Workers and in
 * Node without extra packages.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function base64url(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary)
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const normal = text.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normal.padEnd(Math.ceil(normal.length / 4) * 4, "="));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** A URL-safe random string from `bytes` bytes of entropy. */
export function randomToken(bytes = 32): string {
  return base64url(crypto.getRandomValues(new Uint8Array(bytes)));
}

export async function sha256(text: string): Promise<Uint8Array> {
  return new Uint8Array(
    await crypto.subtle.digest("SHA-256", encoder.encode(text)),
  );
}

export async function sha256Hex(text: string): Promise<string> {
  return [...(await sha256(text))]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** The PKCE S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  return base64url(await sha256(verifier));
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = fromBase64(secret);
  if (raw.length !== 32) {
    throw new Error("TOKEN_ENCRYPTION_KEY must be 32 bytes, base64 encoded");
  }
  return crypto.subtle.importKey("raw", raw, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}

/**
 * Encrypts a token with AES-256-GCM. The output is "v1.<iv>.<ciphertext>".
 * `context` (the user id) is bound in as additional data, so a ciphertext
 * copied onto another user's row will not decrypt.
 */
export async function seal(
  plaintext: string,
  secret: string,
  context: string,
): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const sealed = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: encoder.encode(context) },
    await aesKey(secret),
    encoder.encode(plaintext),
  );
  return `v1.${base64url(iv)}.${base64url(new Uint8Array(sealed))}`;
}

export async function unseal(
  sealed: string,
  secret: string,
  context: string,
): Promise<string> {
  const [version, iv, data] = sealed.split(".");
  if (version !== "v1" || !iv || !data) throw new Error("Unknown token format");
  const plain = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
      additionalData: encoder.encode(context),
    },
    await aesKey(secret),
    fromBase64(data),
  );
  return decoder.decode(plain);
}

/** Compares two strings without leaking where they differ. */
export function safeEqual(a: string, b: string): boolean {
  const x = encoder.encode(a);
  const y = encoder.encode(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  }
  return diff === 0;
}
