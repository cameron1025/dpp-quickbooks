// POST /api/admin/merchants/[id]/disconnect
// Admin disconnects a client's QuickBooks on their behalf (revokes + deletes
// tokens at Intuit, marks the merchant disconnected).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { revokeAndDeleteTokens } from "@/lib/quickbooks";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { logger } from "@/lib/logger";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  try {
    await revokeAndDeleteTokens(id);

    await getSupabaseAdmin()
      .from("merchants")
      .update({
        qb_connected: false,
        qb_disconnected_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq("id", id);

    logger.info("Admin-initiated disconnect completed", { merchantId: id });
    return NextResponse.json({ success: true });
  } catch (error) {
    logger.error("Admin disconnect failed", {
      merchantId: id,
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Failed to disconnect" },
      { status: 500 }
    );
  }
}
