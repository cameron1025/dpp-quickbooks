// ============================================================
// QuickBooks Webhook HMAC Validation
// ============================================================
// Intuit requires HMAC-SHA256 signature verification on all
// incoming webhook payloads. This is a hard requirement for
// App Store approval.

import crypto from "crypto";
import { logger } from "@/lib/logger";

/**
 * Validate an incoming QuickBooks webhook signature.
 *
 * Intuit signs the webhook payload body with HMAC-SHA256 using
 * your Webhook Verifier Token, then sends the signature in the
 * `intuit-signature` header (base64-encoded).
 *
 * @param payload - The raw request body as a string
 * @param signature - The `intuit-signature` header value
 * @returns true if valid, false otherwise
 */
export function validateWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const verifierToken = process.env.QB_WEBHOOK_VERIFIER_TOKEN;

  if (!verifierToken) {
    logger.error("QB_WEBHOOK_VERIFIER_TOKEN is not configured");
    return false;
  }

  if (!signature) {
    logger.warn("Missing intuit-signature header on webhook request");
    return false;
  }

  try {
    const hash = crypto
      .createHmac("sha256", verifierToken)
      .update(payload)
      .digest("base64");

    // Use timing-safe comparison to prevent timing attacks
    const expected = Buffer.from(hash, "utf8");
    const received = Buffer.from(signature, "utf8");

    if (expected.length !== received.length) {
      logger.warn("Webhook signature length mismatch");
      return false;
    }

    const isValid = crypto.timingSafeEqual(expected, received);

    if (!isValid) {
      logger.warn("Webhook signature validation failed", {
        expected: hash.substring(0, 8) + "...",
        received: signature.substring(0, 8) + "...",
      });
    }

    return isValid;
  } catch (error) {
    logger.error("Error validating webhook signature", { error });
    return false;
  }
}

/**
 * Verify the shared secret embedded in the DPP webhook URL.
 *
 * Deluxe/DPP does NOT sign its outbound webhooks (no HMAC, signature
 * header, token, basic-auth, or mTLS). Since we register the webhook
 * `eventUri` with Deluxe, we embed a high-entropy secret in that URL
 * (e.g. `/api/webhooks/dpp?token=<secret>`) and verify it here in
 * constant time. This is combined with the source-IP allowlist and
 * strict payload validation for defense in depth.
 *
 * @param provided - The token from the request URL (`?token=` or path segment)
 * @returns true if it matches DPP_WEBHOOK_URL_SECRET, false otherwise
 */
export function verifyDPPUrlSecret(
  provided: string | null | undefined
): boolean {
  const expected = process.env.DPP_WEBHOOK_URL_SECRET;

  if (!expected) {
    logger.error("DPP_WEBHOOK_URL_SECRET is not configured");
    return false;
  }

  if (!provided) {
    logger.warn("DPP webhook: missing URL secret token");
    return false;
  }

  const a = Buffer.from(provided, "utf8");
  const b = Buffer.from(expected, "utf8");

  // Length guard — timingSafeEqual throws on unequal lengths.
  if (a.length !== b.length) {
    logger.warn("DPP webhook: URL secret length mismatch");
    return false;
  }

  try {
    return crypto.timingSafeEqual(a, b);
  } catch (error) {
    logger.error("Error verifying DPP URL secret", { error });
    return false;
  }
}
