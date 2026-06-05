// GET /api/admin/onboard-link?mid=DELUXE_MID  — generate a signed onboarding link

import { NextRequest, NextResponse } from "next/server";
import { generateOnboardUrl } from "@/lib/onboard-auth";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

export async function GET(request: NextRequest) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const mid = (request.nextUrl.searchParams.get("mid") || "").trim();
  if (!mid) {
    return NextResponse.json({ error: "Missing mid" }, { status: 400 });
  }

  try {
    const url = generateOnboardUrl(mid);
    return NextResponse.json({ url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to generate link" },
      { status: 500 }
    );
  }
}
