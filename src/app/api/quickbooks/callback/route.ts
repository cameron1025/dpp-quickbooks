// ============================================================
// GET /api/quickbooks/callback
// ============================================================
// OAuth 2.0 callback handler. Validates state, exchanges code
// for tokens, verifies email via OpenID, creates/updates
// merchant, and stores encrypted tokens.

import { NextRequest, NextResponse } from "next/server";
import {
  exchangeCodeForTokens,
  getUserProfile,
  storeTokens,
  QuickBooksClient,
} from "@/lib/quickbooks";
import { getSupabaseAdmin } from "@/lib/supabase";
import { realmIdSchema } from "@/lib/sanitize";
import { ensureWebhookSubscription } from "@/lib/dpp/subscribe";
import { logger } from "@/lib/logger";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const state = searchParams.get("state");
  const realmId = searchParams.get("realmId");
  const error = searchParams.get("error");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  // ── Handle user-cancelled or error from Intuit ────────────
  if (error) {
    logger.warn("OAuth callback received error", { error });
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=oauth_denied&detail=${encodeURIComponent(error)}`
    );
  }

  // ── Validate required params ──────────────────────────────
  if (!code || !state || !realmId) {
    logger.warn("Missing OAuth callback parameters", {
      hasCode: !!code,
      hasState: !!state,
      hasRealmId: !!realmId,
    });
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=invalid_callback`
    );
  }

  // ── Validate CSRF state ───────────────────────────────────
  const storedState = request.cookies.get("qb_oauth_state")?.value;

  if (!storedState || storedState !== state) {
    logger.warn("OAuth state mismatch — possible CSRF attack", {
      hasStoredState: !!storedState,
    });
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=state_mismatch`
    );
  }

  // ── Validate realm ID format ──────────────────────────────
  const realmValidation = realmIdSchema.safeParse(realmId);
  if (!realmValidation.success) {
    logger.warn("Invalid realm ID format", { realmId });
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=invalid_realm`
    );
  }

  try {
    // ── Exchange authorization code for tokens ──────────────
    const callbackUrl = request.url;
    const tokens = await exchangeCodeForTokens(callbackUrl);

    logger.info("Token exchange successful", {
      realm_id: tokens.realm_id,
    });

    // ── Get user profile via OpenID Connect ─────────────────
    const profile = await getUserProfile(tokens.access_token);

    // ── CRITICAL: Verify email is verified (Intuit requirement) ──
    if (!profile.emailVerified) {
      logger.warn("Rejecting unverified email", {
        email: profile.email,
      });
      return NextResponse.redirect(
        `${appUrl}/dashboard?error=email_not_verified`
      );
    }

    // ── Onboarding: a validated Deluxe MID carried from the connect step ──
    const onboardMid = request.cookies.get("onboard_mid")?.value || null;

    // ── Resolve the merchant's BUSINESS name from QuickBooks ──
    // This brands the customer-facing invoice email (From name + header). Use the
    // QB company name (CompanyInfo.CompanyName), NOT the Intuit login profile,
    // which is a person. Falls back to the profile name / email if the call fails.
    let businessName: string | null = null;
    try {
      const qb = new QuickBooksClient(tokens);
      const info = await qb.getCompanyInfo();
      const qbName = (info?.CompanyInfo as any)?.CompanyName;
      if (typeof qbName === "string" && qbName.trim()) {
        businessName = qbName.trim();
      }
    } catch (err) {
      logger.warn("Could not fetch QB company name at connect; falling back", {
        error: err instanceof Error ? err.message : String(err),
      });
    }
    const resolvedCompanyName =
      businessName ||
      (profile.givenName && profile.familyName
        ? `${profile.givenName} ${profile.familyName}`
        : profile.email);

    // ── Upsert merchant record ──────────────────────────────
    const supabase = getSupabaseAdmin();

    const { data: merchant, error: merchantError } = await supabase
      .from("merchants")
      .upsert(
        {
          email: profile.email,
          company_name: resolvedCompanyName,
          qb_realm_id: tokens.realm_id,
          qb_connected: true,
          qb_connected_at: new Date().toISOString(),
          qb_disconnected_at: null,
          status: "active",
          updated_at: new Date().toISOString(),
          // Link the Deluxe MID atomically during onboarding (only when present
          // so re-connecting without an onboarding link never clears it).
          ...(onboardMid && { dpp_merchant_id: onboardMid }),
        },
        { onConflict: "email" }
      )
      .select("id")
      .single();

    if (merchantError || !merchant) {
      logger.error("Failed to upsert merchant", {
        error: merchantError,
      });
      return NextResponse.redirect(
        `${appUrl}/dashboard?error=merchant_create_failed`
      );
    }

    // ── Store encrypted tokens ──────────────────────────────
    await storeTokens(merchant.id, tokens);

    // ── Auto-subscribe DPP webhooks for onboarded merchants ──
    // Best-effort: the connection still succeeds if this hiccups. Failures are
    // visible in the admin health view and re-subscribable from there.
    if (onboardMid) {
      try {
        await ensureWebhookSubscription(merchant.id, onboardMid);
      } catch (subErr) {
        logger.error("Auto-subscribe failed during onboarding (continuing)", {
          merchantId: merchant.id,
          mid: onboardMid,
          error: subErr instanceof Error ? subErr.message : String(subErr),
        });
      }
    }

    // ── Set session cookie ──────────────────────────────────
    // Check if this was opened as a popup (from embed view)
    const isPopup = searchParams.get("popup") === "true" || request.cookies.get("qb_oauth_popup")?.value === "true";

    if (isPopup) {
      // Close popup and notify parent
      const html = `
        <!DOCTYPE html>
        <html><body>
          <p>Connected! This window will close...</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'dpp-qb-connected', merchantId: '${merchant.id}' }, '*');
            }
            window.close();
          </script>
        </body></html>
      `;
      const popupResponse = new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html' },
      });
      popupResponse.cookies.set("dpp_merchant_id", merchant.id, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        maxAge: 60 * 60 * 24 * 30,
        path: "/",
      });
      popupResponse.cookies.delete("qb_oauth_state");
      popupResponse.cookies.delete("qb_oauth_popup");
      popupResponse.cookies.delete("onboard_mid");
      return popupResponse;
    }

    const response = NextResponse.redirect(
      `${appUrl}/dashboard?connected=true`
    );

    response.cookies.set("dpp_merchant_id", merchant.id, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: "/",
    });

    // Clear the OAuth state + onboarding cookies
    response.cookies.delete("qb_oauth_state");
    response.cookies.delete("onboard_mid");

    logger.info("OAuth flow completed successfully", {
      merchantId: merchant.id,
      realm_id: tokens.realm_id,
      email: profile.email,
    });

    return response;
  } catch (err) {
    logger.error("OAuth callback failed", {
      error: err instanceof Error ? err.message : String(err),
    });
    return NextResponse.redirect(
      `${appUrl}/dashboard?error=oauth_exchange_failed`
    );
  }
}
