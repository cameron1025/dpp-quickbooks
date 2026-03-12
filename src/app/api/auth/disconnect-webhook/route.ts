// ============================================================
// POST /api/auth/disconnect-webhook
// ============================================================
// Handles disconnect events from the QuickBooks App Store.
// When a user disconnects from apps.com, Intuit posts here.
// Also handles GET redirect after disconnect.

import { NextRequest, NextResponse } from "next/server";
import { deleteTokensForRealm } from "@/lib/quickbooks";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    
    logger.info("App Store disconnect webhook received", {
      bodyLength: body.length,
    });

    let realmId: string | null = null;

    // Try to parse as JSON (webhook payload)
    try {
      const payload = JSON.parse(body);
      realmId = payload.eventNotifications?.[0]?.realmId 
        || payload.realmId
        || null;
    } catch {
      // May come as form data or query params
      const params = new URLSearchParams(body);
      realmId = params.get("realmId");
    }

    if (realmId) {
      await deleteTokensForRealm(realmId);
      logger.info("App Store disconnect processed", { realmId });
    } else {
      logger.warn("App Store disconnect: no realmId found in payload", {
        body: body.substring(0, 200),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("App Store disconnect webhook failed", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json({ success: true });
  }
}

export async function GET(request: NextRequest) {
  const realmId = request.nextUrl.searchParams.get("realmId");
  const merchantId = request.cookies.get("dpp_merchant_id")?.value;
  
  if (realmId) {
    await deleteTokensForRealm(realmId);
    logger.info("App Store disconnect via GET with realmId", { realmId });
  } else if (merchantId) {
    // No realmId in URL — use the merchant cookie to clean up
    const { revokeAndDeleteTokens } = await import("@/lib/quickbooks");
    await revokeAndDeleteTokens(merchantId);
    logger.info("App Store disconnect via GET with merchant cookie", { merchantId });
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/dashboard?disconnected=appstore`);
}