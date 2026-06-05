// ============================================================
// Onboarding Invitation Email
// ============================================================
// Operator -> merchant invite: a PaySync-branded email containing the signed
// onboarding link, so the admin can invite a client straight from the panel
// instead of copy-pasting the link into their own mail client.
//
// Requires: RESEND_API_KEY (and a verified sending domain in Resend).
// From: ALERT_EMAIL_FROM (PaySync-branded operator address).

import { generateOnboardUrl } from "@/lib/onboard-auth";
import { logger } from "@/lib/logger";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

interface SendOnboardingEmailParams {
  email: string;
  mid: string;
  companyName?: string;
}

export async function sendOnboardingEmail(
  params: SendOnboardingEmailParams
): Promise<{ sent: boolean; url: string; error?: string }> {
  const { email, mid, companyName } = params;

  // Always generate the link (also returned so the caller can show/copy it).
  const url = generateOnboardUrl(mid);

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return { sent: false, url, error: "RESEND_API_KEY not configured" };
  }

  const from = process.env.ALERT_EMAIL_FROM || "PaySync <alerts@perspectiveproductions.net>";
  const greetingName = companyName ? escapeHtml(companyName) : "there";
  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr><td align="center" style="padding:40px 20px;">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.07);">
        <tr><td style="background-color:#111827;padding:22px 32px;">
          <span style="color:#ffffff;font-size:18px;font-weight:700;">PaySync</span>
        </td></tr>
        <tr><td style="padding:32px;">
          <p style="margin:0 0 6px;color:#111827;font-size:18px;font-weight:600;">Connect your QuickBooks</p>
          <p style="margin:0 0 20px;color:#555555;font-size:15px;line-height:1.6;">
            Hi ${greetingName}, you've been set up to automatically sync your Deluxe
            payments into QuickBooks Online. Click below to connect your QuickBooks
            account &mdash; it takes about a minute, and you can disconnect anytime.
          </p>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
            <tr><td align="center" style="padding:4px 0 24px;">
              <a href="${url}" target="_blank" style="display:inline-block;background-color:#2CA01C;color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 44px;border-radius:8px;">
                Connect QuickBooks
              </a>
            </td></tr>
          </table>
          <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;text-align:center;">
            This secure link is valid for 7 days. Questions? Just reply to this email.
          </p>
        </td></tr>
        <tr><td style="background-color:#f8f9fa;padding:18px 32px;border-top:1px solid #e9ecef;">
          <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
            PaySync by Perspective Productions. If you weren't expecting this, you can ignore it.
          </p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`.trim();

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [email],
        subject: "Connect your QuickBooks to start syncing payments",
        html,
        reply_to: "support@perspectiveproductions.net",
      }),
    });

    if (!res.ok) {
      const body = await res.text();
      logger.error("Onboarding email send failed", { status: res.status, body });
      return { sent: false, url, error: `Resend ${res.status}: ${body}` };
    }

    logger.info("Onboarding invite sent", { email, mid });
    return { sent: true, url };
  } catch (err) {
    const error = err instanceof Error ? err.message : String(err);
    logger.error("Onboarding email transport error", { error });
    return { sent: false, url, error };
  }
}
