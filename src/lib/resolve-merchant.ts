import { getSupabaseAdmin } from "@/lib/supabase";

/**
 * Resolves a merchant identifier to a Supabase UUID.
 * Accepts either the UUID directly or a DPP merchant ID.
 */
export async function resolveMerchantId(id: string): Promise<string | null> {
  const supabase = getSupabaseAdmin();

  // If it looks like a UUID, use it directly
  if (id.includes('-') && id.length === 36) {
    return id;
  }

  // Otherwise look up by dpp_merchant_id
  const { data, error } = await supabase
    .from('merchants')
    .select('id')
    .eq('dpp_merchant_id', id)
    .single();

  if (error || !data) {
    return null;
  }

  return data.id;
}