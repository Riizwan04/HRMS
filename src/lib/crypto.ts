import "server-only";
import { createCipheriv, hkdfSync, randomBytes } from "node:crypto";

// Aadhaar is stored encrypted by the app (ARCHITECTURE.md section 5) and is never shown unmasked or decrypted anywhere.
// Only the last 4 digits are kept readable for the mask.
// Key: AADHAAR_ENCRYPTION_KEY (32 random bytes, base64) when set; otherwise derived (HKDF-SHA256) from CLERK_SECRET_KEY, which is already
// a server-only secret, so no extra setup is needed. Nothing ever decrypts the value, so a rotated secret loses nothing we use.
function encryptionKey(): Buffer | null {
  const explicit = Buffer.from(process.env.AADHAAR_ENCRYPTION_KEY ?? "", "base64");
  if (explicit.length === 32) return explicit;
  const secret = process.env.CLERK_SECRET_KEY;
  if (!secret) return null;
  return Buffer.from(hkdfSync("sha256", secret, "kinara-hrms", "aadhaar-encryption-v1", 32));
}

export const aadhaarKeyConfigured = (): boolean => encryptionKey() !== null;

/** AES-256-GCM. Returns base64 of iv(12) + tag(16) + ciphertext, plus the last 4 digits for the mask. */
export function encryptAadhaar(aadhaar: string): { ct: string; last4: string } {
  if (!/^\d{12}$/.test(aadhaar)) throw new Error("invalid_aadhaar");
  const key = encryptionKey();
  if (!key) throw new Error("aadhaar_key_missing");
  const iv = randomBytes(12);
  const c = createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([c.update(aadhaar, "utf8"), c.final()]);
  return { ct: Buffer.concat([iv, c.getAuthTag(), enc]).toString("base64"), last4: aadhaar.slice(-4) };
}
