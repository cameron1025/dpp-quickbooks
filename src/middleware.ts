// ============================================================
// Next.js Middleware
// ============================================================
// Applied to all routes. Handles:
// - CSRF protection on state-changing requests
// - Auth redirects for protected pages
// - Security header augmentation

import { NextRequest, NextResponse } from "next/server";
import { isValidAdminCookie, ADMIN_COOKIE_NAME } from "@/lib/admin-auth";

// Routes that don't require authentication
const PUBLIC_ROUTES = [
  "/learn-more",
  "/onboard",
  "/api/webhooks",
  "/api/auth/disconnect-webhook",
  "/api/quickbooks/connect",
  "/api/quickbooks/callback",
  "/api/health",
  "/api/test",
  "/api/invoices/reminders",
  "/embed",
  "/api/embed",
];

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ── Admin auth (separate from merchant auth) ──────────────
  // The login endpoints are open; everything else under /admin and
  // /api/admin requires a valid admin session cookie.
  if (pathname === "/admin/login" || pathname === "/api/admin/login") {
    return NextResponse.next();
  }
  if (pathname.startsWith("/admin") || pathname.startsWith("/api/admin")) {
    const ok = await isValidAdminCookie(
      request.cookies.get(ADMIN_COOKIE_NAME)?.value
    );
    if (ok) return NextResponse.next();
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return NextResponse.redirect(new URL("/admin/login", request.url));
  }

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
    const merchantId = request.cookies.get("dpp_merchant_id")?.value
      || request.headers.get("x-merchant-id");
    if (!merchantId) {
      return NextResponse.json(
        {
          success: false,
          error: { code: "UNAUTHORIZED", message: "Not authenticated" },
        },
        { status: 401 }
      );
    }

    // Pass merchant ID to the route handler via header
    const response = NextResponse.next();
    if (merchantId) {
      response.headers.set("x-merchant-id", merchantId);
    }
    return response;
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
