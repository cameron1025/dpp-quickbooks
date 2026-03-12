import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { PaymentSyncService } from "@/lib/quickbooks";
import { merchantSettingsSchema } from "@/lib/sanitize";
import { resolveMerchantId } from "@/lib/resolve-merchant";
import { logger } from "@/lib/logger";

// GET — fetch current settings + QB accounts
export async function GET(request: NextRequest) {
  const rawId = request.cookies.get("dpp_merchant_id")?.value
    || request.headers.get("x-merchant-id");

  if (!rawId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: merchant } = await supabase
      .from("merchants")
      .select("settings, qb_connected")
      .eq("id", merchantId)
      .single();

    if (!merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    let accounts: Array<Record<string, unknown>> = [];

    if (merchant.qb_connected) {
      try {
        const syncService = new PaymentSyncService(merchantId);
        accounts = await syncService.getAccounts();
      } catch (err) {
        logger.warn("Failed to fetch QB accounts for settings", {
          merchantId,
          error: err instanceof Error ? err.message : String(err),
        });
      }
    }

    return NextResponse.json({
      settings: merchant.settings,
      accounts,
    });
  } catch (error) {
    logger.error("Failed to fetch settings", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to load settings" }, { status: 500 });
  }
}

// POST — save settings
export async function POST(request: NextRequest) {
  const rawId = request.cookies.get("dpp_merchant_id")?.value
    || request.headers.get("x-merchant-id");

  if (!rawId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validation = merchantSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid settings", details: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();

    const { error } = await supabase
      .from("merchants")
      .update({
        settings: validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", merchantId);

    if (error) {
      throw error;
    }

    logger.info("Settings saved", { merchantId });

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to save settings", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to save settings" }, { status: 500 });
  }
}