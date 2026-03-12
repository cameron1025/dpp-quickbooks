import { NextRequest, NextResponse } from "next/server";
import { processFailedSyncs } from "@/lib/quickbooks/retry-sync";

export async function POST(request: NextRequest) {
  try {
    const authHeader = request.headers.get("authorization");
    const cronSecret = process.env.CRON_SECRET;

    if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
      // TODO: Add session check for dashboard-triggered retries
    }

    const result = await processFailedSyncs();

    return NextResponse.json({
      success: true,
      ...result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("[RetryAPI] Error processing retries:", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    );
  }
}
