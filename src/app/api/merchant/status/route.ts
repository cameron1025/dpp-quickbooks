// ============================================================
// GET /api/merchant/status
// ============================================================
// Returns the current merchant's connection status and stats.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { getValidTokens, PaymentSyncService } from "@/lib/quickbooks";
import { resolveMerchantId } from "@/lib/resolve-merchant";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const rawId = request.cookies.get("dpp_merchant_id")?.value
    || request.headers.get("x-merchant-id");

  if (!rawId) {
    return NextResponse.json({
      connected: false,
      connectionHealth: "disconnected",
      stats: {
        paymentsToday: 0,
        revenueToday: 0,
        syncedInvoices: 0,
        pendingSync: 0,
      },
    });
  }

  const merchantId = await resolveMerchantId(rawId);
  if (!merchantId) {
    return NextResponse.json({
      connected: false,
      connectionHealth: "disconnected",
      stats: {
        paymentsToday: 0,
        revenueToday: 0,
        syncedInvoices: 0,
        pendingSync: 0,
      },
    });
  }

  try {
    const supabase = getSupabaseAdmin();

    // Get merchant record
    const { data: merchant } = await supabase
      .from("merchants")
      .select("*")
      .eq("id", merchantId)
      .single();

    if (!merchant) {
      return NextResponse.json({
        connected: false,
        connectionHealth: "disconnected",
        stats: {
          paymentsToday: 0,
          revenueToday: 0,
          syncedInvoices: 0,
          pendingSync: 0,
        },
      });
    }

    // Check connection health
    let connectionHealth: "healthy" | "degraded" | "disconnected" =
      "disconnected";
    let companyName = merchant.company_name;

    if (merchant.qb_connected) {
      const tokens = await getValidTokens(merchantId);
      if (tokens) {
        try {
          const syncService = new PaymentSyncService(merchantId);
          const health = await syncService.checkConnectionHealth();
          connectionHealth = health.healthy ? "healthy" : "degraded";
          if (health.companyName) companyName = health.companyName;
        } catch {
          connectionHealth = "degraded";
        }
      }
    }

    // TODO: Replace with real stats from your database
    const stats = {
      paymentsToday: 0,
      revenueToday: 0,
      syncedInvoices: 0,
      pendingSync: 0,
    };

    return NextResponse.json({
      connected: merchant.qb_connected,
      companyName,
      connectedAt: merchant.qb_connected_at,
      connectionHealth,
      lastSyncAt: null,
      stats,
    });
  } catch (error) {
    logger.error("Failed to fetch merchant status", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        connected: false,
        connectionHealth: "disconnected",
        stats: {
          paymentsToday: 0,
          revenueToday: 0,
          syncedInvoices: 0,
          pendingSync: 0,
        },
      },
      { status: 500 }
    );
  }
}