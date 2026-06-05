// ============================================================
// Admin Authentication (single shared password)
// ============================================================
// Low-maintenance operator auth: one ADMIN_PASSWORD. On login we set an
// httpOnly cookie whose value is HMAC(ADMIN_PASSWORD, "dpp-admin"). Verifying
// the cookie never exposes the password and survives restarts (deterministic).
//
// NOTE: kept dependency-free (Web Crypto) so it works in the Edge middleware
// runtime as well as Node route handlers.

const ADMIN_COOKIE = "admin_session";
const COOKIE_PAYLOAD = "dpp-admin-v1";

export const ADMIN_COOKIE_NAME = ADMIN_COOKIE;

async function hmacHex(secret: string, message: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

/**
 * The expected cookie value for the configured ADMIN_PASSWORD.
 */
export async function adminCookieValue(): Promise<string | null> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return null;
  return hmacHex(password, COOKIE_PAYLOAD);
}

/**
 * Constant-time check of a submitted password against ADMIN_PASSWORD.
 */
export async function verifyAdminPassword(submitted: string): Promise<boolean> {
  const password = process.env.ADMIN_PASSWORD;
  if (!password) return false;
  // Compare via HMAC to keep it constant-time and length-independent.
  const a = await hmacHex(password, "pw-check");
  const b = await hmacHex(submitted, "pw-check");
  return timingSafeEqualHex(a, b);
}

/**
 * Validate an admin_session cookie value.
 */
export async function isValidAdminCookie(value: string | undefined | null): Promise<boolean> {
  if (!value) return false;
  const expected = await adminCookieValue();
  if (!expected) return false;
  return timingSafeEqualHex(value, expected);
}
