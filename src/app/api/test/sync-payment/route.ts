// Test endpoint — creates a sample payment in QB sandbox
// DELETE THIS BEFORE PRODUCTION

import { NextRequest, NextResponse } from "next/server";
import { PaymentSyncService } from "@/lib/quickbooks";
import { DPPTransaction } from "@/types";
import { logger } from "@/lib/logger";

export async function POST(request: NextRequest) {
  const merchantId = request.cookies.get("dpp_merchant_id")?.value;

  if (!merchantId) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  try {
    const syncService = new PaymentSyncService(merchantId);

    // First, check connection health
    const health = await syncService.checkConnectionHealth();
    if (!health.healthy) {
      return NextResponse.json(
        { error: "QB connection unhealthy", details: health.error },
        { status: 500 }
      );
    }

    // Create a mock DPP transaction
    const mockTransaction: DPPTransaction = {
      id: `dpp-${Date.now()}`,
      merchant_id: merchantId,
      amount: 49.99,
      currency: "USD",
      status: "completed",
      customer_email: "testcustomer@example.com",
      customer_name: `Test Customer ${Date.now()}`,
      payment_method: "credit_card",
      created_at: new Date().toISOString(),
      metadata: { source: "test-sync" },
    };

    // Sync it to QuickBooks
    const qbPayment = await syncService.syncPayment(mockTransaction);

    logger.info("Test payment synced", {
      qbPaymentId: qbPayment.Id,
      amount: qbPayment.TotalAmt,
    });

    return NextResponse.json({
      success: true,
      data: {
        companyName: health.companyName,
        qbPaymentId: qbPayment.Id,
        amount: qbPayment.TotalAmt,
        message: "Payment created in QuickBooks sandbox!",
      },
    });
  } catch (error) {
    logger.error("Test sync failed", {
      error: error instanceof Error ? error.message : String(error),
    });

    return NextResponse.json(
      {
        error: "Sync failed",
        details: error instanceof Error ? error.message : String(error),
      },
      { status: 500 }
    );
  }
}