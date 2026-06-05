/**
 * /onboard — Merchant onboarding landing page
 *
 * Server component. Validates the signed onboarding link, then shows a single
 * "Connect to QuickBooks" call to action. The signed params are passed through
 * to /api/quickbooks/connect, which re-validates them and carries the MID into
 * the OAuth callback (where dpp_merchant_id is set and webhooks are subscribed).
 *
 * URL: /onboard?mid=DELUXE_MID&ts=TIMESTAMP&sig=SIGNATURE
 */

import { validateOnboardAuth } from "@/lib/onboard-auth";

// The page's output depends entirely on the request-time signed params, so it
// must render per-request (never statically cached).
export const dynamic = "force-dynamic";

interface OnboardPageProps {
  searchParams: Promise<{ mid?: string; ts?: string; sig?: string }>;
}

const wrap = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  minHeight: "100vh",
  fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
  background: "#f4f4f7",
  padding: "20px",
} as const;

const card = {
  background: "#ffffff",
  borderRadius: "12px",
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  padding: "40px",
  maxWidth: "460px",
  width: "100%",
  textAlign: "center" as const,
};

export default async function OnboardPage({ searchParams }: OnboardPageProps) {
  const { mid, ts, sig } = await searchParams;
  const auth = validateOnboardAuth({ mid: mid || "", ts: ts || "", sig: sig || "" });

  if (!auth.valid) {
    const expired = auth.error === "Link expired";
    return (
      <div style={wrap}>
        <div style={card}>
          <h2 style={{ color: "#333", marginBottom: "8px", fontSize: "20px" }}>
            {expired ? "This link has expired" : "Invalid onboarding link"}
          </h2>
          <p style={{ fontSize: "14px", color: "#666", lineHeight: 1.5 }}>
            {expired
              ? "Onboarding links are valid for 7 days. Please request a new link to continue."
              : "We couldn't verify this link. Please contact your account manager for a new one."}
          </p>
        </div>
      </div>
    );
  }

  const qs = new URLSearchParams({ mid: mid!, ts: ts!, sig: sig! });
  const connectUrl = `/api/quickbooks/connect?${qs.toString()}`;

  return (
    <div style={wrap}>
      <div style={card}>
        <h1 style={{ color: "#1a1a1a", fontSize: "22px", marginBottom: "12px" }}>
          Connect your QuickBooks
        </h1>
        <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, marginBottom: "28px" }}>
          Link your QuickBooks Online account to start automatically syncing your
          payments. It takes about a minute, and you can disconnect anytime.
        </p>
        <a
          href={connectUrl}
          style={{
            display: "inline-block",
            background: "#2CA01C",
            color: "#ffffff",
            textDecoration: "none",
            fontSize: "16px",
            fontWeight: 600,
            padding: "14px 32px",
            borderRadius: "8px",
          }}
        >
          Connect to QuickBooks
        </a>
        <p style={{ fontSize: "12px", color: "#999", marginTop: "24px", lineHeight: 1.5 }}>
          You'll be redirected to Intuit to authorize the connection securely.
        </p>
      </div>
    </div>
  );
}
