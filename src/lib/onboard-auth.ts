/**
 * Onboarding Link Authentication
 *
 * Signed, time-limited onboarding links so only the operator (admin) can
 * authorize a given Deluxe MID to be linked to a QuickBooks connection.
 * Prevents a stranger from connecting their QuickBooks to someone else's MID.
 *
 * URL format:
 *   /onboard?mid=DELUXE_MID&ts=UNIX_TIMESTAMP&sig=HMAC_SIGNATURE
 *
 * The signature covers `mid:ts`, signed with ONBOARD_SECRET.
 * Links are valid for 7 days (they're emailed, unlike the 5-min embed links).
 *
 * Env var required: ONBOARD_SECRET
 */

import crypto from "crypto";

const ONBOARD_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const CLOCK_SKEW_MS = 60 * 1000; // allow 1 min of future skew

export interface OnboardParams {
  mid: string;
  ts: string;
  sig: string;
}

export interface OnboardValidateResult {
  valid: boolean;
  mid?: string;
  error?: string;
}

function sign(mid: string, ts: string, secret: string): string {
  return crypto.createHmac("sha256", secret).update(`${mid}:${ts}`).digest("hex");
}

/**
 * Validate an onboarding link's signature and freshness.
 */
export function validateOnboardAuth(params: OnboardParams): OnboardValidateResult {
  const { mid, ts, sig } = params;
  const secret = process.env.ONBOARD_SECRET;

  if (!secret) {
    console.error("[Onboard Auth] ONBOARD_SECRET not configured");
    return { valid: false, error: "Onboarding not configured" };
  }

  if (!mid || !ts || !sig) {
    return { valid: false, error: "Missing required parameters" };
  }

  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: "Invalid timestamp" };
  }

  const age = Date.now() - timestamp * 1000;
  if (age > ONBOARD_EXPIRY_MS) {
    return { valid: false, error: "Link expired" };
  }
  if (age < -CLOCK_SKEW_MS) {
    return { valid: false, error: "Invalid timestamp" };
  }

  const expectedSig = sign(mid, ts, secret);

  let sigValid = false;
  try {
    sigValid = crypto.timingSafeEqual(
      Buffer.from(sig, "hex"),
      Buffer.from(expectedSig, "hex")
    );
  } catch {
    // Malformed hex / length mismatch
    return { valid: false, error: "Invalid signature" };
  }

  if (!sigValid) {
    return { valid: false, error: "Invalid signature" };
  }

  return { valid: true, mid };
}

/**
 * Generate a signed onboarding URL for a given Deluxe MID.
 */
export function generateOnboardUrl(mid: string, baseUrl?: string): string {
  const secret = process.env.ONBOARD_SECRET;
  if (!secret) throw new Error("ONBOARD_SECRET not configured");

  const base =
    baseUrl ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://dpp-quickbooks-production.up.railway.app";

  const ts = Math.floor(Date.now() / 1000).toString();
  const sig = sign(mid, ts, secret);

  const qs = new URLSearchParams({ mid, ts, sig });
  return `${base}/onboard?${qs.toString()}`;
}
