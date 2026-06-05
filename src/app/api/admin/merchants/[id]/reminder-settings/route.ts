// PUT /api/admin/merchants/[id]/reminder-settings
// Admin-side editor for a merchant's reminder / invoice-email configuration
// (top-level merchant columns the invoice webhook + reminder scheduler read).

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { reminderSettingsSchema } from "@/lib/sanitize";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const validation = reminderSettingsSchema.safeParse(body);

  if (!validation.success) {
    return NextResponse.json(
      { error: "Invalid reminder settings", details: validation.error.issues },
      { status: 400 }
    );
  }

  const { error } = await getSupabaseAdmin()
    .from("merchants")
    .update({ ...validation.data, updated_at: new Date().toISOString() })
    .eq("id", id);

  if (error) {
    return NextResponse.json({ error: "Failed to save reminder settings" }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
