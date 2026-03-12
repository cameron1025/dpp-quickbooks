// ============================================================
// Token Manager — Supabase persistence with encryption
// ============================================================
// Handles: storing, retrieving, refreshing, and revoking
// QuickBooks OAuth tokens. Tokens are encrypted at rest.

import { createClient } from "@supabase/supabase-js";
import { QBTokens } from "@/types";
import { encryptTokens, decryptTokens } from "@/lib/encryption";
import { refreshAccessToken, isTokenExpired, isRefreshTokenExpired, revokeToken } from "./oauth";
import { logger } from "@/lib/logger";

// ── Supabase Admin Client ───────────────────────────────────

function getSupabaseAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

// ── Store Tokens ────────────────────────────────────────────

export async function storeTokens(
  merchantId: string,
  tokens: QBTokens
): Promise<void> {
  const supabase = getSupabaseAdmin();
  const encrypted = encryptTokens(tokens);

  const record = {
    merchant_id: merchantId,
    realm_id: tokens.realm_id,
    encrypted_access_token: encrypted.encrypted_access_token,
    encrypted_refresh_token: encrypted.encrypted_refresh_token,
    access_token_expires_at: new Date(
      tokens.created_at + tokens.expires_in * 1000
    ).toISOString(),
    refresh_token_expires_at: new Date(
      tokens.created_at + tokens.x_refresh_token_expires_in * 1000
    ).toISOString(),
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from("qb_tokens")
    .upsert(record, { onConflict: "merchant_id" });

  if (error) {
    logger.error("Failed to store tokens", { error, merchantId });
    throw new Error(`Failed to store tokens: ${error.message}`);
  }

  logger.info("Tokens stored successfully", { merchantId, realm_id: tokens.realm_id });
}

// ── Retrieve Tokens ─────────────────────────────────────────

export async function getTokens(
  merchantId: string
): Promise<QBTokens | null> {
  const supabase = getSupabaseAdmin();

  const { data, error } = await supabase
    .from("qb_tokens")
    .select("*")
    .eq("merchant_id", merchantId)
    .single();

  if (error || !data) {
    logger.warn("No tokens found", { merchantId });
    return null;
  }

  try {
    const decrypted = decryptTokens(data);

    return {
      access_token: decrypted.access_token,
      refresh_token: decrypted.refresh_token,
      token_type: "bearer",
      expires_in: 3600,
      x_refresh_token_expires_in: 8726400,
      created_at:
        new Date(data.access_token_expires_at).getTime() - 3600 * 1000,
      realm_id: data.realm_id,
    };
  } catch (err) {
    logger.error("Failed to decrypt tokens", { merchantId, error: err });
    return null;
  }
}

// ── Get Valid Tokens (auto-refresh if needed) ───────────────

export async function getValidTokens(
  merchantId: string
): Promise<QBTokens | null> {
  const tokens = await getTokens(merchantId);
  if (!tokens) return null;

  // If refresh token is expired, connection is dead
  if (isRefreshTokenExpired(tokens)) {
    logger.warn("Refresh token expired, marking disconnected", { merchantId });
    await markDisconnected(merchantId);
    return null;
  }

  // If access token is expired, refresh it
  if (isTokenExpired(tokens)) {
    try {
      const refreshed = await refreshAccessToken(tokens.refresh_token);
      refreshed.realm_id = tokens.realm_id;
      await storeTokens(merchantId, refreshed);
      return refreshed;
    } catch (err) {
      logger.error("Token refresh failed", { merchantId, error: err });
      return null;
    }
  }

  return tokens;
}

// ── Revoke & Delete Tokens (disconnect from app) ────────────

export async function revokeAndDeleteTokens(
  merchantId: string
): Promise<void> {
  const tokens = await getTokens(merchantId);

  // Attempt to revoke at Intuit (best-effort)
  if (tokens) {
    try {
      await revokeToken(tokens.access_token);
      logger.info("Token revoked at Intuit", { merchantId });
    } catch (err) {
      logger.warn("Failed to revoke token at Intuit (continuing cleanup)", {
        merchantId,
        error: err,
      });
    }
  }

  // Delete from our database regardless
  const supabase = getSupabaseAdmin();
  const { error } = await supabase
    .from("qb_tokens")
    .delete()
    .eq("merchant_id", merchantId);

  if (error) {
    logger.error("Failed to delete token record", { merchantId, error });
  }

  await markDisconnected(merchantId);
  logger.info("Tokens deleted and merchant marked disconnected", { merchantId });
}

// ── Delete Tokens Only (disconnect from App Store) ──────────

export async function deleteTokensForRealm(
  realmId: string
): Promise<void> {
  const supabase = getSupabaseAdmin();

  // Find the merchant by realm_id
  const { data: tokenRecord } = await supabase
    .from("qb_tokens")
    .select("merchant_id")
    .eq("realm_id", realmId)
    .single();

  if (tokenRecord) {
    await supabase
      .from("qb_tokens")
      .delete()
      .eq("realm_id", realmId);

    await markDisconnected(tokenRecord.merchant_id);
    logger.info("Tokens deleted for realm (App Store disconnect)", { realmId });
  }
}

// ── Mark Merchant as Disconnected ───────────────────────────

async function markDisconnected(merchantId: string): Promise<void> {
  const supabase = getSupabaseAdmin();

  await supabase
    .from("merchants")
    .update({
      qb_connected: false,
      qb_disconnected_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", merchantId);
}
