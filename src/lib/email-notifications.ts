import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SyncFailureDetails {
  merchantId: string;
  transactionId: string;
  errorMessage: string;
  attempts: number;
}

interface EmailPayload {
  from: string;
  to: string;
  subject: string;
  html: string;
}

async function sendEmail(payload: EmailPayload): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    console.warn(
      "[Email] RESEND_API_KEY not set - logging email instead of sending"
    );
    console.log("[Email] Would send:", {
      to: payload.to,
      subject: payload.subject,
    });
    return false;
  }

  try {
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[Email] Send failed:", response.status, errorText);
      return false;
    }

    console.log("[Email] Sent successfully to", payload.to);
    return true;
  } catch (error) {
    console.error("[Email] Transport error:", error);
    return false;
  }
}

export async function sendSyncFailureEmail(
  details: SyncFailureDetails
): Promise<void> {
  const fromAddress =
    process.env.ALERT_EMAIL_FROM || "PaySync <alerts@perspectiveproductions.net>";
  const toAddress = process.env.ALERT_EMAIL_TO || "";

  if (!toAddress) {
    console.warn("[Email] ALERT_EMAIL_TO not configured - skipping notification");
    return;
  }

  let merchantName = details.merchantId;
  try {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("company_name")
      .eq("id", details.merchantId)
      .single();

    if (merchant?.company_name) {
      merchantName = merchant.company_name;
    }
  } catch {
    // Use merchant ID as fallback
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dpp-quickbooks-production.up.railway.app";
  const subject = `Sync Failed: Transaction ${details.transactionId}`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #DC2626; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Payment Sync Failed</h2>
      </div>
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0; color: #374151;">
          A payment sync to QuickBooks has permanently failed after
          <strong>${details.attempts} attempts</strong>.
        </p>
        <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
          <tr>
            <td style="padding: 8px 0; color: #6B7280; width: 140px;">Merchant</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 500;">${merchantName}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B7280;">Transaction ID</td>
            <td style="padding: 8px 0; color: #111827; font-family: monospace; font-size: 14px;">${details.transactionId}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B7280;">Attempts</td>
            <td style="padding: 8px 0; color: #111827;">${details.attempts}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #6B7280;">Last Error</td>
            <td style="padding: 8px 0; color: #DC2626; font-size: 14px;">${details.errorMessage}</td>
          </tr>
        </table>
        <div style="background: #FEF2F2; border: 1px solid #FECACA; border-radius: 6px; padding: 12px 16px; margin-top: 16px;">
          <p style="margin: 0; color: #991B1B; font-size: 14px;">
            <strong>Action needed:</strong> Check the sync log in your
            <a href="${appUrl}/dashboard" style="color: #DC2626;">PaySync Dashboard</a>
            and manually resolve this transaction.
          </p>
        </div>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
          PaySync — Automated Alert
        </p>
      </div>
    </div>
  `;

  await sendEmail({ from: fromAddress, to: toAddress, subject, html });
}

export async function sendDailyDigest(): Promise<void> {
  const toAddress = process.env.ALERT_EMAIL_TO;
  if (!toAddress) return;

  const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: stats } = await supabase
    .from("sync_log")
    .select("status")
    .gte("created_at", oneDayAgo);

  if (!stats || stats.length === 0) return;

  const counts = stats.reduce(
    (acc, row) => {
      acc[row.status] = (acc[row.status] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  const total = stats.length;
  const synced = counts["synced"] || 0;
  const failed = (counts["failed_permanent"] || 0) + (counts["failed"] || 0) + (counts["failed_retrying"] || 0);

  if (failed === 0) return;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "https://dpp-quickbooks-production.up.railway.app";
  const subject = `PaySync Digest: ${synced}/${total} succeeded, ${failed} failed`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
      <div style="background: #1F2937; color: white; padding: 16px 24px; border-radius: 8px 8px 0 0;">
        <h2 style="margin: 0; font-size: 18px;">Daily Sync Digest</h2>
      </div>
      <div style="border: 1px solid #E5E7EB; border-top: none; padding: 24px; border-radius: 0 0 8px 8px;">
        <p style="margin-top: 0; color: #374151;">Last 24 hours summary:</p>
        <table style="width: 100%; border-collapse: collapse;">
          <tr>
            <td style="padding: 8px 0; color: #6B7280;">Total transactions</td>
            <td style="padding: 8px 0; color: #111827; font-weight: 600;">${total}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #059669;">Synced</td>
            <td style="padding: 8px 0; color: #059669; font-weight: 600;">${synced}</td>
          </tr>
          <tr>
            <td style="padding: 8px 0; color: #DC2626;">Failed</td>
            <td style="padding: 8px 0; color: #DC2626; font-weight: 600;">${failed}</td>
          </tr>
        </table>
        <p style="margin-top: 16px;">
          <a href="${appUrl}/dashboard" style="color: #2563EB;">View Dashboard</a>
        </p>
        <hr style="border: none; border-top: 1px solid #E5E7EB; margin: 24px 0;" />
        <p style="margin: 0; color: #9CA3AF; font-size: 12px;">
          PaySync — Daily Digest
        </p>
      </div>
    </div>
  `;

  await sendEmail({
    from: process.env.ALERT_EMAIL_FROM || "PaySync <alerts@perspectiveproductions.net>",
    to: toAddress,
    subject,
    html,
  });
}
