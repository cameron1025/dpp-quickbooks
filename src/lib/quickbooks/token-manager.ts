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

// Refresh coordination. Intuit ROTATES the refresh token on every refresh and
// invalidates the old one; worse, if it sees the SAME refresh token used twice
// (a "fork") it revokes the ENTIRE token family — a hard death that needs a
// manual reconnect. So refreshes must be serialized at TWO levels:
//  1. In-memory single-flight (refreshInFlight) — collapses concurrent refreshes
//     WITHIN one container (proactive getValidTokens + reactive 401s).
//  2. A DB lock (qb_tokens.refresh_lock_until) — serializes ACROSS containers,
//     e.g. the old+new container that briefly run together during a Railway
//     deploy. Without this, a refresh during deploy overlap forks the token.
const refreshInFlight = new Map<string, Promise<QBTokens | null>>();

// Far-past sentinel so the lock column is never NULL and we can claim it with a
// simple `.lt(now)` (avoids PostgREST `.or()` timestamp-parsing pitfalls).
const LOCK_PAST = "1970-01-01T00:00:00.000Z";
const LOCK_TTL_MS = 30_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Atomically claim the per-merchant refresh lock. Returns true if THIS process
 * may refresh. Degrades safe: if the column doesn't exist yet (migration 007 not
 * run) or the DB hiccups, returns true so refreshes are never blocked — that just
 * reverts to the in-process-only behavior, no worse than before.
 */
async function acquireRefreshLock(merchantId: string): Promise<boolean> {
  try {
    const nowIso = new Date().toISOString();
    const until = new Date(Date.now() + LOCK_TTL_MS).toISOString();
    const { data, error } = await getSupabaseAdmin()
      .from("qb_tokens")
      .update({ refresh_lock_until: until })
      .eq("merchant_id", merchantId)
      .lt("refresh_lock_until", nowIso)
      .select("merchant_id");
    if (error) {
      logger.warn("QB refresh lock unavailable; proceeding without cross-process lock", {
        merchantId,
        error: error.message,
      });
      return true;
    }
    return !!(data && data.length > 0);
  } catch (err) {
    logger.warn("QB refresh lock error; proceeding without cross-process lock", {
      merchantId,
      error: err instanceof Error ? err.message : String(err),
    });
    return true;
  }
}

async function releaseRefreshLock(merchantId: string): Promise<void> {
  try {
    await getSupabaseAdmin()
      .from("qb_tokens")
      .update({ refresh_lock_until: LOCK_PAST })
      .eq("merchant_id", merchantId);
  } catch {
    // Best-effort: the lease expires on its own after LOCK_TTL_MS.
  }
}

/** Another container holds the lock — poll for it to store the refreshed token. */
async function waitForFreshToken(merchantId: string): Promise<QBTokens | null> {
  for (let i = 0; i < 8; i++) {
    await sleep(400);
    const t = await getTokens(merchantId);
    if (t && !isTokenExpired(t)) return t;
    if (t && isRefreshTokenExpired(t)) return null;
  }
  return null; // transient: caller treats as no-token; self-heals next cycle
}

/**
 * Perform exactly one coordinated token refresh per merchant. Hardened against
 * every way a rotation can poison the connection:
 *  - In-memory single-flight + DB lock so two refreshes never fork the token.
 *  - Re-reads the latest persisted token before refreshing (never a stale one).
 *  - If Intuit rejects but a concurrent op stored a newer valid token, uses it.
 *  - If persisting the rotated token fails, retries and STILL returns it (the old
 *    token is already dead at Intuit, so discarding it would poison the row).
 */
function singleFlightRefresh(merchantId: string): Promise<QBTokens | null> {
  const existing = refreshInFlight.get(merchantId);
  if (existing) return existing;

  const refreshPromise = (async (): Promise<QBTokens | null> => {
    try {
      const latest = await getTokens(merchantId);
      if (!latest) return null;
      // Another path already refreshed between the caller's check and now.
      if (!isTokenExpired(latest)) return latest;
      if (isRefreshTokenExpired(latest)) {
        logger.warn("Refresh token expired, marking disconnected", { merchantId });
        await markDisconnected(merchantId);
        return null;
      }

      // Cross-process serialization — see the note above.
      const locked = await acquireRefreshLock(merchantId);
      if (!locked) {
        return await waitForFreshToken(merchantId);
      }

      try {
        // Re-read after locking; the prior holder may have just stored a token.
        const current = (await getTokens(merchantId)) || latest;
        if (!isTokenExpired(current)) return current;
        if (isRefreshTokenExpired(current)) {
          await markDisconnected(merchantId);
          return null;
        }

        let refreshed: QBTokens;
        try {
          refreshed = await refreshAccessToken(current.refresh_token);
        } catch (err) {
          const newer = await getTokens(merchantId);
          if (
            newer &&
            newer.refresh_token !== current.refresh_token &&
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

        refreshed.realm_id = current.realm_id;

        try {
          await storeTokens(merchantId, refreshed);
        } catch (storeErr) {
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
        await releaseRefreshLock(merchantId);
      }
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
