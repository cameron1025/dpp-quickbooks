import { NextRequest, NextResponse } from "next/server";
import { processFailedSyncs } from "@/lib/quickbooks/retry-sync";

export async function POST(request: NextRequest) {
  // Cron-only endpoint — require the shared secret (matches the reminders cron).
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
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
