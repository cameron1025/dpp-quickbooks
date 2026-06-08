// ============================================================
// Minimal HS256 JWT signer (no external dependency)
// ============================================================
// Deluxe's Embedded Payments SDK takes a JWT signed (HS256) with the merchant's
// Signature Key. The secret stays SERVER-SIDE — the signed JWT is safe to hand to
// the browser. Uses Node crypto, mirroring lib/quickbooks/webhooks.ts.
//
// The Signature Key is treated as a UTF-8 string secret (jwt.io's default for
// HS256). If Deluxe ever issues a base64-encoded key, decode it before signing.

import crypto from "crypto";

function base64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

/**
 * Sign a payload as a compact HS256 JWT. `iat` should already be set by the
 * caller if required; this function does not add claims.
 */
export function signJwtHS256(
  payload: Record<string, unknown>,
  secret: string
): string {
  if (!secret) throw new Error("Missing JWT signing secret");

  const header = { alg: "HS256", typ: "JWT" };
  const encodedHeader = base64url(JSON.stringify(header));
  const encodedPayload = base64url(JSON.stringify(payload));
  const signingInput = `${encodedHeader}.${encodedPayload}`;

  const signature = base64url(
    crypto.createHmac("sha256", secret).update(signingInput).digest()
  );

  return `${signingInput}.${signature}`;
}
