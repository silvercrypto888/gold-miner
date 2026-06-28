// @ts-nocheck
"use client";

const SESSION_MESSAGE_TEXT = "Unlock Gold Miner session";
const SESSION_MESSAGE = new TextEncoder().encode(SESSION_MESSAGE_TEXT);

/**
 * Derive an AES-256-GCM key from a wallet Ed25519 signature.
 * SHA-256 normalizes the 64-byte signature into a uniform 32-byte key.
 */
export async function deriveKeyFromSignature(signature: Uint8Array): Promise<CryptoKey> {
  const hashBuffer = await crypto.subtle.digest("SHA-256", signature as any);
  return crypto.subtle.importKey(
    "raw",
    hashBuffer,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

/**
 * Encrypt a session secret key using the wallet signature as the key source.
 * Returns base64-encoded ciphertext and IV.
 */
export async function encryptSessionKey(
  secretKey: Uint8Array,
  walletSignMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<{ enc: string; iv: string }> {
  const signature = await walletSignMessage(SESSION_MESSAGE);
  const key = await deriveKeyFromSignature(signature);

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
 * Decrypt a session secret key. Requires the wallet to re-sign the same message
 * so the exact same AES key is re-derived.
 */
export async function decryptSessionKey(
  enc: string,
  iv: string,
  walletSignMessage: (message: Uint8Array) => Promise<Uint8Array>
): Promise<Uint8Array> {
  const signature = await walletSignMessage(SESSION_MESSAGE);
  const key = await deriveKeyFromSignature(signature);

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
