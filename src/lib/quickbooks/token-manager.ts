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

// In-memory single-flight: collapse concurrent refreshes for the same merchant
// into one call. Intuit ROTATES the refresh token on every refresh and
// invalidates the old one, so two UNCOORDINATED refreshes with the same token
// drop the connection (the access token then dies ~1h later, surfacing as the
// admin "Degraded" health and "Token refresh failed"). EVERY refresh — proactive
// (getValidTokens) and reactive (QuickBooksClient on a 401) — must funnel through
// singleFlightRefresh so only one rotation happens at a time. The app runs as a
// single long-lived container, so a module-level map is sufficient.
const refreshInFlight = new Map<string, Promise<QBTokens | null>>();

/**
 * Perform exactly one coordinated token refresh per merchant. Concurrent callers
 * share the same in-flight promise. Hardened against the two ways a rotation can
 * poison the connection:
 *  - Re-reads the latest persisted token before refreshing, so it never refreshes
 *    with a stale in-memory token that a concurrent op already rotated.
 *  - If Intuit rejects the refresh but a concurrent op already stored a newer,
 *    still-valid token, it uses that instead of dropping the connection.
 *  - If persisting the rotated token fails, it retries and STILL returns the new
 *    token — Intuit has already killed the old one, so discarding it would poison
 *    the stored row and force a manual reconnect.
 */
function singleFlightRefresh(merchantId: string): Promise<QBTokens | null> {
  const existing = refreshInFlight.get(merchantId);
  if (existing) return existing;

  const refreshPromise = (async (): Promise<QBTokens | null> => {
    try {
      // Always refresh against the LATEST persisted token, not a stale snapshot.
      const latest = await getTokens(merchantId);
      if (!latest) return null;

      if (isRefreshTokenExpired(latest)) {
        logger.warn("Refresh token expired, marking disconnected", { merchantId });
        await markDisconnected(merchantId);
        return null;
      }

      let refreshed: QBTokens;
      try {
        refreshed = await refreshAccessToken(latest.refresh_token);
      } catch (err) {
        // Intuit rejected the token. If a concurrent refresh already rotated and
        // stored a newer, still-valid token, recover by using it.
        const newer = await getTokens(merchantId);
        if (
          newer &&
          newer.refresh_token !== latest.refresh_token &&
          !isTokenExpired(newer)
        ) {
          logger.warn("Refresh rejected but a newer token is stored; using it", {
            merchantId,
          });
          return newer;
        }
        logger.error("QB token refresh rejected by Intuit (reconnect required)", {
          merchantId,
          error: err instanceof Error ? err.message : String(err),
        });
        return null;
      }

      refreshed.realm_id = latest.realm_id;

      try {
        await storeTokens(merchantId, refreshed);
      } catch (storeErr) {
        // The old refresh token is already dead at Intuit — do NOT discard the
        // rotated one. Retry the persist; return the token regardless so the row
        // isn't poisoned and the current request can still proceed.
        logger.error("CRITICAL: refreshed QB token but failed to persist — retrying", {
          merchantId,
          error: storeErr instanceof Error ? storeErr.message : String(storeErr),
        });
        try {
          await storeTokens(merchantId, refreshed);
        } catch (retryErr) {
          logger.error("CRITICAL: token persist retry failed — connection at risk", {
            merchantId,
            error: retryErr instanceof Error ? retryErr.message : String(retryErr),
          });
        }
      }
      return refreshed;
    } finally {
      refreshInFlight.delete(merchantId);
    }
  })();

  refreshInFlight.set(merchantId, refreshPromise);
  return refreshPromise;
}

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

  // Access token still valid — use it.
  if (!isTokenExpired(tokens)) {
    return tokens;
  }

  // Access token expired — refresh through the single coordinated path.
  return singleFlightRefresh(merchantId);
}

/**
 * Force a coordinated refresh NOW, regardless of the access-token clock — used by
 * QuickBooksClient when QuickBooks returns 401 on a token that still looks valid.
 * Routes through the SAME single-flight path as getValidTokens, so the API client
 * can never rotate the refresh token out from under a proactive refresh.
 */
export async function forceRefreshTokens(
  merchantId: string
): Promise<QBTokens | null> {
  return singleFlightRefresh(merchantId);
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
