// GET /api/admin/merchants — health view: every merchant with connection,
// subscription, and last-sync status.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const supabase = getSupabaseAdmin();

  const { data: merchants, error } = await supabase
    .from("merchants")
    .select(
      "id, company_name, email, dpp_merchant_id, qb_connected, qb_connected_at, dpp_subscribed_at, status, created_at"
    )
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: "Failed to load merchants" }, { status: 500 });
  }

  // Latest sync_log entry per merchant (from a recent window) for at-a-glance health.
  const { data: recentSyncs } = await supabase
    .from("sync_log")
    .select("merchant_id, status, created_at")
    .order("created_at", { ascending: false })
    .limit(500);

  const lastSyncByMerchant: Record<string, { status: string; created_at: string }> = {};
  for (const row of recentSyncs || []) {
    if (!lastSyncByMerchant[row.merchant_id]) {
      lastSyncByMerchant[row.merchant_id] = {
        status: row.status,
        created_at: row.created_at,
      };
    }
  }

  // Which MIDs have Deluxe credentials configured.
  const { data: credRows } = await supabase.from("dpp_credentials").select("mid");
  const configuredMids = new Set((credRows || []).map((r) => r.mid));

  const result = (merchants || []).map((m) => ({
    ...m,
    subscribed: !!m.dpp_subscribed_at,
    has_credentials: !!m.dpp_merchant_id && configuredMids.has(m.dpp_merchant_id),
    last_sync: lastSyncByMerchant[m.id] || null,
  }));

  return NextResponse.json({ merchants: result });
}
