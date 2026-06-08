// ============================================================
// Pay-link token — opaque, tamper-proof reference to a tracked invoice
// ============================================================
// The invoice email's "Pay Now" button points at /pay/<token>. The token is an
// HMAC-signed reference to a tracked_invoices row, so the customer can't swap it
// to a different invoice. The amount itself is locked separately in the
// server-signed Deluxe JWT, so even a forged token can't change what's charged.

import crypto from "crypto";

function secret(): string {
  const s = process.env.EMBED_SECRET;
  if (!s) throw new Error("EMBED_SECRET not configured");
  return s;
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function fromB64url(s: string): Buffer {
  return Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
}

/** Sign a tracked_invoices id into an opaque pay token. */
export function signPayToken(trackedInvoiceId: string): string {
  const payload = b64url(JSON.stringify({ id: trackedInvoiceId }));
  const sig = b64url(
    crypto.createHmac("sha256", secret()).update(payload).digest()
  );
  return `${payload}.${sig}`;
}

/** Verify a pay token; returns the tracked_invoices id or null if tampered. */
export function verifyPayToken(token: string): { id: string } | null {
  const parts = token.split(".");
  if (parts.length !== 2) return null;
  const [payload, sig] = parts;

  const expected = b64url(
    crypto.createHmac("sha256", secret()).update(payload).digest()
  );
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;

  try {
    const obj = JSON.parse(fromB64url(payload).toString("utf8"));
    if (obj && typeof obj.id === "string") return { id: obj.id };
  } catch {
    // fall through
  }
  return null;
}
