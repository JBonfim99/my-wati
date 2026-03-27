import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";

const ALGO = "aes-256-gcm";
const IV_LEN = 12;
const TAG_LEN = 16;

// Derived key is cached at module scope — scryptSync is intentionally slow
// and must not be called on every encrypt/decrypt operation.
let _cachedKey: Buffer | null = null;

function keyFromEnv(): Buffer {
  if (_cachedKey) return _cachedKey;
  const secret = process.env.APP_ENCRYPTION_KEY;
  if (!secret || secret.length < 16) {
    throw new Error("APP_ENCRYPTION_KEY must be set (min 16 chars)");
  }
  _cachedKey = scryptSync(secret, "my-wati-salt", 32);
  return _cachedKey;
}

/** Returns base64 payload: iv+ciphertext+tag */
export function encryptSecret(plain: string): string {
  const key = keyFromEnv();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, enc, tag]).toString("base64");
}

export function decryptSecret(payloadB64: string): string {
  const key = keyFromEnv();
  const buf = Buffer.from(payloadB64, "base64");
  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(buf.length - TAG_LEN);
  const data = buf.subarray(IV_LEN, buf.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString(
    "utf8",
  );
}
