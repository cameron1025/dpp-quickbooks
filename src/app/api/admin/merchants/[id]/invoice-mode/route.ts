// POST /api/admin/merchants/[id]/invoice-mode  { mode: "paysync" | "qb_native" }
// Sets how the Deluxe pay link reaches the customer on a new invoice.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

const MODES = ["paysync", "qb_native"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const mode = body?.mode;

  if (!MODES.includes(mode)) {
    return NextResponse.json(
      { error: "mode must be 'paysync' or 'qb_native'" },
      { status: 400 }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("merchants")
    .update({ invoice_email_mode: mode, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to update mode" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
