// POST /api/admin/merchants/[id]/dpp-config
// Update a merchant's Deluxe MID and (when all three are provided) store their
// API credentials, keyed by that MID. Body: { mid, clientId?, clientSecret?,
// partnerToken? }

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import {
  setMerchantDppCredentials,
  getMerchantDppCredentialsOrNull,
} from "@/lib/dpp/credentials";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;
  const body = await request.json().catch(() => ({}));
  const mid = typeof body?.mid === "string" ? body.mid.trim() : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret =
    typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
  const partnerToken =
    typeof body?.partnerToken === "string" ? body.partnerToken.trim() : "";
  const signatureKey =
    typeof body?.signatureKey === "string" ? body.signatureKey.trim() : "";
  // null = field not sent; string (incl. "") = set/clear the logo.
  const logoUrl =
    typeof body?.logo_url === "string" ? body.logo_url.trim() : null;

  if (!mid) {
    return NextResponse.json({ error: "MID is required" }, { status: 400 });
  }

  // Update the merchant's Deluxe MID.
  const { error } = await getSupabaseAdmin()
    .from("merchants")
    .update({ dpp_merchant_id: mid, updated_at: new Date().toISOString() })
    .eq("id", id);
  if (error) {
    return NextResponse.json({ error: "Failed to update MID" }, { status: 500 });
  }

  // Logo is best-effort: a not-yet-migrated logo_url column must not block the
  // MID/credential save (run sql/006_merchant_logo_url.sql to enable it).
  if (logoUrl !== null) {
    await getSupabaseAdmin()
      .from("merchants")
      .update({ logo_url: logoUrl || null, updated_at: new Date().toISOString() })
      .eq("id", id);
  }

  // Store credentials when the core three are present (optionally with the
  // embedded Signature Key), or patch just the Signature Key onto existing creds
  // so the operator doesn't have to re-enter the other secrets.
  try {
    if (clientId && clientSecret && partnerToken) {
      await setMerchantDppCredentials(mid, {
        clientId,
        clientSecret,
        partnerToken,
        ...(signatureKey && { signatureKey }),
      });
    } else if (signatureKey) {
      const existing = await getMerchantDppCredentialsOrNull(mid);
      if (!existing) {
        return NextResponse.json(
          { error: "Enter the Deluxe API credentials before adding a Signature Key" },
          { status: 400 }
        );
      }
      await setMerchantDppCredentials(mid, { ...existing, signatureKey });
    }
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to store credentials" },
      { status: 500 }
    );
  }

  return NextResponse.json({ success: true });
}
