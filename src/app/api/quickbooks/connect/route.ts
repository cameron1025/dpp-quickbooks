// ============================================================
// GET /api/quickbooks/connect
// ============================================================
// Initiates the OAuth 2.0 + OpenID Connect flow.
// Generates a CSRF state parameter and redirects to Intuit.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthorizationUrl } from "@/lib/quickbooks/oauth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const isPopup = request.nextUrl.searchParams.get("popup") === "true";

    // Generate a cryptographically secure state parameter
    // to prevent CSRF attacks during OAuth flow
    const state = crypto.randomBytes(32).toString("hex");

    // Store state in a short-lived cookie for validation on callback
    const authUrl = getAuthorizationUrl(state);

    logger.info("Initiating QuickBooks OAuth flow", {
      state: state.substring(0, 8) + "...",
      popup: isPopup,
    });

    const response = NextResponse.redirect(authUrl);

    // Set state cookie
    response.cookies.set("qb_oauth_state", state, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 600,
      path: "/",
    });

    // Flag that this is a popup flow
    if (isPopup) {
      response.cookies.set("qb_oauth_popup", "true", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 600,
        path: "/",
      });
    }

    return response;
  } catch (error) {
    logger.error("Failed to initiate OAuth flow", { error });
    return NextResponse.redirect(
      new URL("/dashboard?error=oauth_init_failed", request.url)
    );
  }
}