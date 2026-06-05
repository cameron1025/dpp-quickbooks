// POST /api/admin/dpp-credentials
// Store (encrypted) a client's Deluxe API credentials, keyed by MID.
// Body: { mid, clientId, clientSecret, partnerToken }

import { NextRequest, NextResponse } from "next/server";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { setMerchantDppCredentials } from "@/lib/dpp/credentials";

export async function POST(request: NextRequest) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mid = typeof body?.mid === "string" ? body.mid.trim() : "";
  const clientId = typeof body?.clientId === "string" ? body.clientId.trim() : "";
  const clientSecret =
    typeof body?.clientSecret === "string" ? body.clientSecret.trim() : "";
  const partnerToken =
    typeof body?.partnerToken === "string" ? body.partnerToken.trim() : "";

  if (!mid || !clientId || !clientSecret || !partnerToken) {
    return NextResponse.json(
      { error: "mid, clientId, clientSecret and partnerToken are all required" },
      { status: 400 }
    );
  }

  try {
    await setMerchantDppCredentials(mid, { clientId, clientSecret, partnerToken });
    return NextResponse.json({ success: true });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to save credentials" },
      { status: 500 }
    );
  }
}
