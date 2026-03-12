// ============================================================
// Token Encryption — AES-256-GCM for OAuth tokens at rest
// ============================================================
// Intuit security requirement: tokens must be encrypted at rest

import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  const key = process.env.ENCRYPTION_KEY;
  if (!key || key.length < 64) {
    throw new Error(
      "ENCRYPTION_KEY must be a 32-byte hex string (64 hex chars). " +
        "Generate one with: openssl rand -hex 32"
    );
  }
  return Buffer.from(key, "hex");
}

export function encrypt(plaintext: string): string {
  const key = getEncryptionKey();
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  let encrypted = cipher.update(plaintext, "utf8", "hex");
  encrypted += cipher.final("hex");

  const authTag = cipher.getAuthTag();

  // Format: iv:authTag:ciphertext (all hex)
  return `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted}`;
}

export function decrypt(encryptedPayload: string): string {
  const key = getEncryptionKey();
  const parts = encryptedPayload.split(":");

  if (parts.length !== 3) {
    throw new Error("Invalid encrypted payload format");
  }

  const [ivHex, authTagHex, ciphertext] = parts;
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  let decrypted = decipher.update(ciphertext, "hex", "utf8");
  decrypted += decipher.final("utf8");

  return decrypted;
}

/**
 * Encrypt a full token set for database storage.
 */
export function encryptTokens(tokens: {
  access_token: string;
  refresh_token: string;
}): {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
} {
  return {
    encrypted_access_token: encrypt(tokens.access_token),
    encrypted_refresh_token: encrypt(tokens.refresh_token),
  };
}

/**
 * Decrypt tokens retrieved from the database.
 */
export function decryptTokens(record: {
  encrypted_access_token: string;
  encrypted_refresh_token: string;
}): {
  access_token: string;
  refresh_token: string;
} {
  return {
    access_token: decrypt(record.encrypted_access_token),
    refresh_token: decrypt(record.encrypted_refresh_token),
  };
}
