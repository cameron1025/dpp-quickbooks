// POST /api/admin/send-onboarding
// Generates a signed onboarding link for a MID and emails it to the client.
// Body: { mid: string, email: string, companyName?: string }

import { NextRequest, NextResponse } from "next/server";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";
import { sendOnboardingEmail } from "@/lib/onboarding-email";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function POST(request: NextRequest) {
  if (!(await isValidAdminCookie(request.cookies.get(ADMIN_COOKIE_NAME)?.value))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));
  const mid = typeof body?.mid === "string" ? body.mid.trim() : "";
  const email = typeof body?.email === "string" ? body.email.trim() : "";
  const companyName =
    typeof body?.companyName === "string" ? body.companyName.trim() : undefined;

  if (!mid) {
    return NextResponse.json({ error: "Missing mid" }, { status: 400 });
  }
  if (!EMAIL_RE.test(email)) {
    return NextResponse.json({ error: "Invalid email" }, { status: 400 });
  }

  try {
    const result = await sendOnboardingEmail({ email, mid, companyName });
    if (!result.sent) {
      // Link still generated — return it so the operator can copy/send manually.
      return NextResponse.json(
        { sent: false, url: result.url, error: result.error || "Email not sent" },
        { status: 502 }
      );
    }
    return NextResponse.json({ sent: true, url: result.url });
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send" },
      { status: 500 }
    );
  }
}
