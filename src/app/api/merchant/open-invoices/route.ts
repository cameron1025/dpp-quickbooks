// GET /api/merchant/open-invoices
// Lists the current merchant's open (unpaid) tracked invoices, for the
// "Take a payment" flow.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveMerchantId } from "@/lib/resolve-merchant";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const rawId =
    request.cookies.get("dpp_merchant_id")?.value ||
    request.headers.get("x-merchant-id");

  if (!rawId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  try {
    const { data, error } = await getSupabaseAdmin()
      .from("tracked_invoices")
      .select("id, qb_invoice_id, invoice_number, customer_name, customer_email, balance_due, due_date")
      .eq("merchant_id", merchantId)
      .eq("status", "open")
      .order("due_date", { ascending: true })
      .limit(200);

    if (error) throw error;

    return NextResponse.json({ invoices: data || [] });
  } catch (error) {
    logger.error("Failed to load open invoices", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to load invoices" }, { status: 500 });
  }
}
