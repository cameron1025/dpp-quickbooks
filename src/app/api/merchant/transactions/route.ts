import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const merchantId = request.cookies.get("dpp_merchant_id")?.value;

  if (!merchantId) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  try {
    const supabase = getSupabaseAdmin();

    const { data: logs, error } = await supabase
      .from("sync_log")
      .select("*")
      .eq("merchant_id", merchantId)
      .order("created_at", { ascending: false })
      .limit(50);

    if (error) throw error;

    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    const todayLogs = (logs || []).filter(
      (l) => l.created_at.startsWith(today) && l.status === "success" && l.entity_type === "Payment"
    );

    const stats = {
      paymentsToday: todayLogs.length,
      revenueToday: 0, // Would need amount stored in metadata
      syncedInvoices: (logs || []).filter((l) => l.entity_type === "Invoice" && l.status === "success").length,
      pendingSync: (logs || []).filter((l) => l.status === "pending").length,
    };

    return NextResponse.json({
      transactions: logs || [],
      stats,
    });
  } catch (error) {
    logger.error("Failed to fetch transactions", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ error: "Failed to load transactions" }, { status: 500 });
  }
}