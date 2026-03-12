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
 * Validate a DPP gateway webhook signature.
 * Placeholder — implement your own HMAC scheme.
 */
export function validateDPPWebhookSignature(
  payload: string,
  signature: string
): boolean {
  const secret = process.env.DPP_GATEWAY_WEBHOOK_SECRET;

  if (!secret) {
    logger.error("DPP_GATEWAY_WEBHOOK_SECRET is not configured");
    return false;
  }

  try {
    const hash = crypto
      .createHmac("sha256", secret)
      .update(payload)
      .digest("hex");

    return crypto.timingSafeEqual(
      Buffer.from(hash, "utf8"),
      Buffer.from(signature, "utf8")
    );
  } catch (error) {
    logger.error("Error validating DPP webhook signature", { error });
    return false;
  }
}
