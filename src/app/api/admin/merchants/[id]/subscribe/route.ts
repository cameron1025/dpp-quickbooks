// POST /api/admin/merchants/[id]/subscribe — (re)subscribe a merchant's DPP
// webhooks. Forced, so it can repair a merchant whose auto-subscribe failed.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { ensureWebhookSubscription } from "@/lib/dpp/subscribe";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const supabase = getSupabaseAdmin();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("id, dpp_merchant_id")
    .eq("id", id)
    .single();

  if (!merchant) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }
  if (!merchant.dpp_merchant_id) {
    return NextResponse.json(
      { error: "Merchant has no Deluxe MID linked" },
      { status: 400 }
    );
  }

  try {
    const result = await ensureWebhookSubscription(
      merchant.id,
      merchant.dpp_merchant_id,
      { force: true }
    );
    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Subscribe failed" },
      { status: 502 }
    );
  }
}
