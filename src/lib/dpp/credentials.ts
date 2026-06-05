// ============================================================
// Per-merchant DPP (Deluxe) API credentials
// ============================================================
// Each client merchant has their own Deluxe MID + API credentials. We store
// them encrypted (AES-256-GCM), keyed by MID, and use them to create that
// merchant's webhook subscriptions and payment links — so events and funds
// route to the correct Deluxe account.
//
// No env fallback: a MID with no stored credentials cannot subscribe or create
// payment links (the failure surfaces in the admin health view / logs).

import { getSupabaseAdmin } from "@/lib/supabase";
import { encrypt, decrypt } from "@/lib/encryption";

export interface DppCredentials {
  clientId: string;
  clientSecret: string;
  partnerToken: string;
}

/** Thrown when a MID has no stored credentials. */
export class MissingDppCredentialsError extends Error {
  constructor(mid: string) {
    super(`No DPP credentials configured for MID ${mid}`);
    this.name = "MissingDppCredentialsError";
  }
}

/**
 * Store (or update) a merchant's Deluxe API credentials, encrypted at rest.
 */
export async function setMerchantDppCredentials(
  mid: string,
  creds: DppCredentials
): Promise<void> {
  const encrypted_credentials = encrypt(JSON.stringify(creds));
  const { error } = await getSupabaseAdmin()
    .from("dpp_credentials")
    .upsert(
      { mid, encrypted_credentials, updated_at: new Date().toISOString() },
      { onConflict: "mid" }
    );
  if (error) throw new Error(`Failed to store DPP credentials: ${error.message}`);
}

/**
 * Load and decrypt a merchant's Deluxe API credentials.
 * Throws MissingDppCredentialsError if none are configured for the MID.
 */
export async function getMerchantDppCredentials(mid: string): Promise<DppCredentials> {
  const { data } = await getSupabaseAdmin()
    .from("dpp_credentials")
    .select("encrypted_credentials")
    .eq("mid", mid)
    .maybeSingle();

  if (!data?.encrypted_credentials) {
    throw new MissingDppCredentialsError(mid);
  }

  const parsed = JSON.parse(decrypt(data.encrypted_credentials)) as DppCredentials;
  if (!parsed.clientId || !parsed.clientSecret || !parsed.partnerToken) {
    throw new MissingDppCredentialsError(mid);
  }
  return parsed;
}

/** Like getMerchantDppCredentials, but returns null instead of throwing. */
export async function getMerchantDppCredentialsOrNull(
  mid: string
): Promise<DppCredentials | null> {
  try {
    return await getMerchantDppCredentials(mid);
  } catch {
    return null;
  }
}

/** Whether a MID has stored credentials (for admin status display). */
export async function hasMerchantDppCredentials(mid: string): Promise<boolean> {
  const { data } = await getSupabaseAdmin()
    .from("dpp_credentials")
    .select("mid")
    .eq("mid", mid)
    .maybeSingle();
  return !!data;
}
