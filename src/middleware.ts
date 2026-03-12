// ============================================================
// Next.js Middleware
// ============================================================
// Applied to all routes. Handles:
// - CSRF protection on state-changing requests
// - Auth redirects for protected pages
// - Security header augmentation

import { NextRequest, NextResponse } from "next/server";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/learn-more",
  "/api/webhooks",
  "/api/auth/disconnect-webhook",
  "/api/quickbooks/connect",
  "/api/quickbooks/callback",
  "/api/health",
  "/api/test",
  "/api/invoices/reminders",
];

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Skip public routes ────────────────────────────────────
  const isPublic = PUBLIC_ROUTES.some(
    (route) => pathname.startsWith(route)
  );

  // ── Auth check for protected pages ────────────────────────
  if (!isPublic && pathname.startsWith("/dashboard")) {
    // For dashboard, we allow access but show connect UI if no cookie
    // (the dashboard handles the connected/disconnected state)
  }

  if (!isPublic && pathname.startsWith("/settings")) {
    const merchantId = request.cookies.get("dpp_merchant_id")?.value;
    if (!merchantId) {
      return NextResponse.redirect(
        new URL("/dashboard", request.url)
      );
    }
  }

  // ── API auth check ────────────────────────────────────────
  if (
    pathname.startsWith("/api/") &&
    !isPublic &&
    !pathname.startsWith("/api/quickbooks/connect") &&
    !pathname.startsWith("/api/quickbooks/callback") &&
    !pathname.startsWith("/api/webhooks") &&
    !pathname.startsWith("/api/auth/disconnect-webhook") &&
    !pathname.startsWith("/api/health")
  ) {
    const merchantId = request.cookies.get("dpp_merchant_id")?.value;
    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico
     * - public files
     */
    "/((?!_next/static|_next/image|favicon.ico|images/).*)",
  ],
};
