// ============================================================
// GET /api/quickbooks/connect
// ============================================================
// Initiates the OAuth 2.0 + OpenID Connect flow.
// Generates a CSRF state parameter and redirects to Intuit.
import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { getAuthorizationUrl } from "@/lib/quickbooks/oauth";
import { validateOnboardAuth } from "@/lib/onboard-auth";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  try {
    const params = request.nextUrl.searchParams;
    const isPopup = params.get("popup") === "true";

    // ── Onboarding: carry a validated Deluxe MID through the OAuth round-trip.
    // The MID is only trusted if it arrives with a valid signed onboarding link
    // (re-validated here to prevent arbitrary-MID injection). It's stashed in a
    // short-lived cookie that the callback reads to set dpp_merchant_id.
    const mid = params.get("mid");
    const ts = params.get("ts");
    const sig = params.get("sig");
    let onboardMid: string | null = null;
    if (mid && ts && sig) {
      const onboard = validateOnboardAuth({ mid, ts, sig });
      if (onboard.valid) {
        onboardMid = onboard.mid!;
      } else {
        logger.warn("Onboarding link failed validation on connect", {
          error: onboard.error,
        });
      }
    }

    // Generate a cryptographically secure state parameter
    // to prevent CSRF attacks during OAuth flow
    const state = crypto.randomBytes(32).toString("hex");

    // Store state in a short-lived cookie for validation on callback
    const authUrl = getAuthorizationUrl(state);

    logger.info("Initiating QuickBooks OAuth flow", {
      state: state.substring(0, 8) + "...",
      popup: isPopup,
      onboarding: !!onboardMid,
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

    // Carry the validated onboarding MID to the callback
    if (onboardMid) {
      response.cookies.set("onboard_mid", onboardMid, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 900, // 15 min — enough to complete OAuth
        path: "/",
      });
    }

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