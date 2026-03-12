/**
 * Embed Authentication
 * 
 * Validates signed embed URLs for iframe integration.
 * DPP generates the URL server-side with a shared secret,
 * we validate it here before rendering the embed view.
 * 
 * URL format:
 *   /embed?merchant=MERCHANT_ID&ts=UNIX_TIMESTAMP&sig=HMAC_SIGNATURE
 * 
 * The signature covers: merchant + ts, signed with EMBED_SECRET.
 * Timestamps older than 5 minutes are rejected (replay protection).
 * 
 * Env var required: EMBED_SECRET (shared with DPP)
 */

import crypto from 'crypto';

const EMBED_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes

interface EmbedParams {
  merchant: string;
  ts: string;
  sig: string;
}

interface ValidateResult {
  valid: boolean;
  merchantId?: string;
  error?: string;
}

/**
 * Validate an embed URL's signature and timestamp.
 */
export function validateEmbedAuth(params: EmbedParams): ValidateResult {
  const { merchant, ts, sig } = params;
  const secret = process.env.EMBED_SECRET;

  if (!secret) {
    console.error('[Embed Auth] EMBED_SECRET not configured');
    return { valid: false, error: 'Embed not configured' };
  }

  if (!merchant || !ts || !sig) {
    return { valid: false, error: 'Missing required parameters' };
  }

  // Check timestamp freshness (replay protection)
  const timestamp = parseInt(ts, 10);
  if (isNaN(timestamp)) {
    return { valid: false, error: 'Invalid timestamp' };
  }

  const age = Date.now() - timestamp * 1000;
  if (age > EMBED_EXPIRY_MS) {
    return { valid: false, error: 'Link expired' };
  }

  if (age < -60000) {
    // Allow 1 minute of clock skew into the future
    return { valid: false, error: 'Invalid timestamp' };
  }

  // Validate HMAC signature
  const payload = `${merchant}:${ts}`;
  const expectedSig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  const sigValid = crypto.timingSafeEqual(
    Buffer.from(sig, 'hex'),
    Buffer.from(expectedSig, 'hex')
  );

  if (!sigValid) {
    return { valid: false, error: 'Invalid signature' };
  }

  return { valid: true, merchantId: merchant };
}

/**
 * Generate a signed embed URL (for testing / DPP code snippet).
 */
export function generateEmbedUrl(
  merchantId: string,
  baseUrl: string = 'https://dpp-quickbooks-production.up.railway.app'
): string {
  const secret = process.env.EMBED_SECRET;
  if (!secret) throw new Error('EMBED_SECRET not configured');

  const ts = Math.floor(Date.now() / 1000).toString();
  const payload = `${merchantId}:${ts}`;
  const sig = crypto
    .createHmac('sha256', secret)
    .update(payload)
    .digest('hex');

  return `${baseUrl}/embed?merchant=${merchantId}&ts=${ts}&sig=${sig}`;
}