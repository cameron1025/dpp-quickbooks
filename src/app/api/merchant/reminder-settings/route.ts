// ============================================================
// /api/merchant/reminder-settings
// ============================================================
// GET  — fetch the merchant's invoice-reminder configuration
// PUT  — save it. These are top-level merchant columns (not the
//        `settings` JSONB) because the reminder scheduler and the
//        invoice webhook read them directly.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { reminderSettingsSchema } from "@/lib/sanitize";
import { resolveMerchantId } from "@/lib/resolve-merchant";
import { logger } from "@/lib/logger";

const REMINDER_COLUMNS = [
  "reminders_enabled",
  "reminder_send_initial",
  "reminder_before_due_days",
  "reminder_on_due_date",
  "reminder_overdue_3",
  "reminder_overdue_7",
  "reminder_overdue_14",
  "reminder_from_name",
  "reminder_reply_to",
] as const;

function getRawMerchantId(request: NextRequest): string | null {
  return (
    request.cookies.get("dpp_merchant_id")?.value ||
    request.headers.get("x-merchant-id")
  );
}

// GET — current reminder settings
export async function GET(request: NextRequest) {
  const rawId = getRawMerchantId(request);
  if (!rawId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  try {
    const supabase = getSupabaseAdmin();
    const { data: merchant, error } = await supabase
      .from("merchants")
      .select(REMINDER_COLUMNS.join(", "))
      .eq("id", merchantId)
      .single();

    if (error || !merchant) {
      return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
    }

    return NextResponse.json(merchant);
  } catch (error) {
    logger.error("Failed to fetch reminder settings", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to load reminder settings" },
      { status: 500 }
    );
  }
}

// PUT — save reminder settings
export async function PUT(request: NextRequest) {
  const rawId = getRawMerchantId(request);
  if (!rawId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({ error: "Merchant not found" }, { status: 404 });
  }

  try {
    const body = await request.json();
    const validation = reminderSettingsSchema.safeParse(body);

    if (!validation.success) {
      return NextResponse.json(
        { error: "Invalid reminder settings", details: validation.error.issues },
        { status: 400 }
      );
    }

    const supabase = getSupabaseAdmin();
    const { error } = await supabase
      .from("merchants")
      .update({
        ...validation.data,
        updated_at: new Date().toISOString(),
      })
      .eq("id", merchantId);

    if (error) {
      throw error;
    }

    logger.info("Reminder settings saved", { merchantId });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Failed to save reminder settings", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to save reminder settings" },
      { status: 500 }
    );
  }
}
