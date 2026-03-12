// ============================================================
// POST /api/quickbooks/disconnect
// ============================================================
// User-initiated disconnect from within the app.
// Intuit requirement: After disconnect, the user must remain
// in the app and see the "Connect to QuickBooks" button.

import { NextRequest, NextResponse } from "next/server";
import { revokeAndDeleteTokens } from "@/lib/quickbooks";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const merchantId = request.cookies.get("dpp_merchant_id")?.value;

  if (!merchantId) {
    return NextResponse.json(
      {
        success: false,
        error: { code: "UNAUTHORIZED", message: "Not authenticated" },
      },
      { status: 401 }
    );
  }

  try {
    // Revoke token at Intuit and clean up our records
    await revokeAndDeleteTokens(merchantId);

    logger.info("User-initiated disconnect completed", { merchantId });

    return NextResponse.json({
      success: true,
      data: {
        message: "Successfully disconnected from QuickBooks",
        // Intuit requirement: user stays in the app
        redirect: false,
      },
    });
  } catch (error) {
    logger.error("Disconnect failed", {
      merchantId,
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        success: false,
        error: {
          code: "DISCONNECT_FAILED",
          message: "Failed to disconnect. Please try again.",
        },
      },
      { status: 500 }
    );
  }
}
