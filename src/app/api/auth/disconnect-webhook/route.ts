// ============================================================
// POST /api/auth/disconnect-webhook
// ============================================================
// Handles disconnect events initiated from the QuickBooks App
// Store (apps.com). When a user disconnects your app from the
// App Store, Intuit sends a webhook to this endpoint.
//
// Intuit requirement: the user must be taken to a static page
// after App Store disconnect. This endpoint cleans up tokens
// and returns a redirect URL for the static disconnect page.

import { NextRequest, NextResponse } from "next/server";
import { deleteTokensForRealm, validateWebhookSignature } from "@/lib/quickbooks";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  try {
    const body = await request.text();
    const signature = request.headers.get("intuit-signature") || "";

    // Validate HMAC signature
    if (!validateWebhookSignature(body, signature)) {
      logger.warn("App Store disconnect webhook: invalid signature");
      return NextResponse.json(
        { error: "Invalid signature" },
        { status: 401 }
      );
    }

    const payload = JSON.parse(body);
    const realmId = payload.eventNotifications?.[0]?.realmId;

    if (!realmId) {
      logger.warn("App Store disconnect webhook: missing realmId");
      return NextResponse.json(
        { error: "Missing realmId" },
        { status: 400 }
      );
    }

    // Clean up tokens for this realm
    await deleteTokensForRealm(realmId);

    logger.info("App Store disconnect processed", { realmId });

    // Respond with 200 (Intuit expects this)
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("App Store disconnect webhook failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    // Still return 200 to prevent Intuit from retrying
    return NextResponse.json({ success: true });
  }
}

// ── GET handler for the redirect after App Store disconnect ──
// Intuit may redirect the user here. Show a static disconnect page.
export async function GET() {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/dashboard?disconnected=appstore`);
}
