// POST /api/merchant/payment-link  { invoiceId }
// Generates a Deluxe payment link for one of the merchant's open invoices,
// using the merchant's OWN Deluxe credentials, so a manual/phone payment routes
// through DPP under their account and reconciles to that invoice.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { resolveMerchantId } from "@/lib/resolve-merchant";
import { createInvoicePaymentLink } from "@/lib/dpp/payment-link";
import { getMerchantDppCredentials } from "@/lib/dpp/credentials";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
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

  const body = await request.json().catch(() => ({}));
  const invoiceId = typeof body?.invoiceId === "string" ? body.invoiceId : "";
  if (!invoiceId) {
    return NextResponse.json({ error: "invoiceId is required" }, { status: 400 });
  }

  const supabase = getSupabaseAdmin();

  const { data: merchant } = await supabase
    .from("merchants")
    .select("dpp_merchant_id")
    .eq("id", merchantId)
    .single();
  if (!merchant?.dpp_merchant_id) {
    return NextResponse.json(
      { error: "This account has no Deluxe MID configured." },
      { status: 400 }
    );
  }

  const { data: invoice } = await supabase
    .from("tracked_invoices")
    .select("invoice_number, balance_due, customer_name, status")
    .eq("id", invoiceId)
    .eq("merchant_id", merchantId)
    .maybeSingle();
  if (!invoice) {
    return NextResponse.json({ error: "Invoice not found" }, { status: 404 });
  }
  if (invoice.status !== "open") {
    return NextResponse.json({ error: "Invoice is not open" }, { status: 400 });
  }

  let creds;
  try {
    creds = await getMerchantDppCredentials(merchant.dpp_merchant_id);
  } catch {
    return NextResponse.json(
      { error: "Deluxe credentials are not configured for this account." },
      { status: 400 }
    );
  }

  try {
    const link = await createInvoicePaymentLink(
      {
        invoiceNumber: invoice.invoice_number,
        amount: invoice.balance_due,
        customerName: invoice.customer_name || undefined,
      },
      creds
    );
    await supabase
      .from("tracked_invoices")
      .update({ pay_now_url: link.url, updated_at: new Date().toISOString() })
      .eq("id", invoiceId);
    return NextResponse.json({ url: link.url });
  } catch (err) {
    logger.error("Failed to create manual payment link", {
      merchantId,
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.json(
      { error: "Failed to create payment link. Please try again." },
      { status: 502 }
    );
  }
}
