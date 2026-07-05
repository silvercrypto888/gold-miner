// @ts-nocheck
"use client";

const SESSION_MESSAGE_TEXT = "Unlock Gold Miner session";
const SESSION_MESSAGE = new TextEncoder().encode(SESSION_MESSAGE_TEXT);

const GLOBAL_KEY = "__gm_cachedCryptoKey__";

function getCache(): CryptoKey | null {
  const val = (typeof globalThis !== "undefined" ? (globalThis as any)[GLOBAL_KEY] : null) || null;
  console.log("[sessionCrypto] getCache:", val ? "HIT" : "MISS");
  return val;
}

function setCache(key: CryptoKey | null): void {
  if (typeof globalThis !== "undefined") {
    (globalThis as any)[GLOBAL_KEY] = key;
    console.log("[sessionCrypto] setCache:", key ? "SET" : "CLEARED");
  }
}

/** Expose so callers can check if a cached key exists. */
export function hasCachedCryptoKey(): boolean {
  return getCache() !== null;
}

/** Clear the in-memory cached key (e.g. on wallet disconnect). */
export function clearCachedCryptoKey(): void {
  setCache(null);
}

/**
 * Derive an AES-256-GCM key from a wallet Ed25519 signature.
 * SHA-256 normalizes the 64-byte signature into a uniform 32-byte key.
 * Caches the result so the user is only prompted once per page session.
 */
export async function deriveKeyFromSignature(signature: Uint8Array): Promise<CryptoKey> {
  const cached = getCache();
  if (cached) return cached;
  const hashBuffer = await crypto.subtle.digest("SHA-256", signature as any);
  const key = await crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
  setCache(key);
  return key;
}

/**
 * Encrypt a session secret key using the wallet signature as the key source.
 * Returns base64-encoded ciphertext and IV.
 * Skips the wallet prompt if a key was already derived this page session.
 */
export async function encryptSessionKey(
  secretKey: Uint8Array,
  walletSignMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<{ enc: string; iv: string }> {
  let key = getCache();
  if (!key) {
    const signature = await walletSignMessage(SESSION_MESSAGE);
    key = await deriveKeyFromSignature(signature);
  }

  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    secretKey as any
  );

  return {
    enc: bytesToBase64(new Uint8Array(encrypted)),
    iv: bytesToBase64(iv),
  };
}

/**
 * Decrypt a session secret key. Skips the wallet prompt if the AES key
 * was already derived this page session (cached in memory).
 */
export async function decryptSessionKey(
  enc: string,
  iv: string,
  walletSignMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<Uint8Array> {
  console.log("[sessionCrypto] decryptSessionKey called");
  let key = getCache();
  if (!key) {
    console.log("[sessionCrypto] cache miss — calling walletSignMessage");
    const signature = await walletSignMessage(SESSION_MESSAGE);
    key = await deriveKeyFromSignature(signature);
  } else {
    console.log("[sessionCrypto] cache hit — skipping wallet prompt");
  }

  const ciphertext = base64ToBytes(enc);
  const ivBytes = base64ToBytes(iv);

  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: ivBytes },
    key,
    ciphertext as any
  );

  return new Uint8Array(decrypted);
}

/** Uint8Array → base64 */
function bytesToBase64(bytes: Uint8Array): string {
  const bin = Array.from(bytes, (b) => String.fromCharCode(b)).join("");
  return btoa(bin);
}

/** base64 → Uint8Array */
function base64ToBytes(str: string): Uint8Array {
  const bin = atob(str);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
