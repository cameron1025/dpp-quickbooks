/**
 * Invoice Email Sender
 * 
 * Sends branded invoice notification and reminder emails via Resend.
 * These are CUSTOMER-facing and merchant-branded (the merchant's business name
 * + reply-to), sent from our verified billing domain — distinct from the
 * operator alert emails in email-notifications.ts.
 *
 * Requires env vars: RESEND_API_KEY, INVOICE_EMAIL_FROM (a bare verified email)
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface SendInvoiceEmailParams {
  merchantId: string;
  qbInvoiceId: string;
  invoiceNumber: string;
  customerEmail: string;
  customerName: string;
  amount: number;
  dueDate: string | null;
  payNowUrl: string;
  emailType: 'initial' | 'before_due' | 'due_today' | 'overdue_3' | 'overdue_7' | 'overdue_14';
  fromName?: string;
  replyTo?: string;
  // Optional attachment (e.g. the QB-branded invoice PDF), base64-encoded.
  attachment?: { filename: string; content: string };
}

const EMAIL_SUBJECTS: Record<string, (invoiceNumber: string) => string> = {
  initial: (inv) => `Invoice ${inv} — Payment Request`,
  before_due: (inv) => `Reminder: Invoice ${inv} Due Soon`,
  due_today: (inv) => `Invoice ${inv} Is Due Today`,
  overdue_3: (inv) => `Past Due: Invoice ${inv}`,
  overdue_7: (inv) => `Second Notice: Invoice ${inv} Is Past Due`,
  overdue_14: (inv) => `Final Reminder: Invoice ${inv} Is 14 Days Past Due`,
};

const EMAIL_HEADLINES: Record<string, string> = {
  initial: 'You have a new invoice',
  before_due: 'Friendly reminder — your invoice is due soon',
  due_today: 'Your invoice is due today',
  overdue_3: 'Your invoice is past due',
  overdue_7: 'Your invoice is still outstanding',
  overdue_14: 'Final reminder — please pay your invoice',
};

export async function sendInvoiceEmail(params: SendInvoiceEmailParams): Promise<boolean> {
  const {
    merchantId, qbInvoiceId, invoiceNumber, customerEmail, customerName,
    amount, dueDate, payNowUrl, emailType, fromName, replyTo, attachment,
  } = params;

  // Check for duplicate (idempotency)
  const { data: existing } = await supabase
    .from('invoice_emails')
    .select('id')
    .eq('merchant_id', merchantId)
    .eq('qb_invoice_id', qbInvoiceId)
    .eq('email_type', emailType)
    .maybeSingle();

  if (existing) {
    console.log(`[Invoice Email] Already sent ${emailType} for invoice ${invoiceNumber}, skipping`);
    return true;
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  // Bare verified sending address for customer emails (NOT the operator alert
  // "Name <email>" address). The merchant's name becomes the display name below.
  const FROM_EMAIL = process.env.INVOICE_EMAIL_FROM || 'billing@perspectiveproductions.net';

  if (!RESEND_API_KEY) {
    console.warn('[Invoice Email] RESEND_API_KEY not configured');
    // Record the attempt so we don't retry endlessly
    await recordEmail(params, null, 'failed', 'Email service not configured');
    return false;
  }

  // Brand the email with the merchant's business name.
  const { data: merchant } = await supabase
    .from('merchants')
    .select('company_name')
    .eq('id', merchantId)
    .single();
  const businessName = merchant?.company_name || fromName || 'Billing';

  const subject = EMAIL_SUBJECTS[emailType]?.(invoiceNumber) || `Invoice ${invoiceNumber}`;
  const headline = EMAIL_HEADLINES[emailType] || 'Invoice notification';
  const html = buildEmailHtml({
    businessName,
    customerName,
    headline,
    invoiceNumber,
    amount,
    dueDate,
    payNowUrl,
    emailType,
  });

  try {
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${RESEND_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: `${businessName} <${FROM_EMAIL}>`,
        to: [customerEmail],
        subject,
        html,
        ...(replyTo && { reply_to: replyTo }),
        ...(attachment && { attachments: [attachment] }),
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[Invoice Email] Resend error: ${response.status} ${errBody}`);
      await recordEmail(params, null, 'failed', errBody);
      return false;
    }

    const result = await response.json();
    await recordEmail(params, result.id, 'sent', null);
    console.log(`[Invoice Email] Sent ${emailType} for invoice ${invoiceNumber} to ${customerEmail}`);
    return true;
  } catch (err: any) {
    console.error(`[Invoice Email] Send failed:`, err);
    await recordEmail(params, null, 'failed', err.message);
    return false;
  }
}

async function recordEmail(
  params: SendInvoiceEmailParams,
  resendMessageId: string | null,
  status: string,
  errorMessage: string | null
): Promise<void> {
  const { data, error } = await supabase.from('invoice_emails').insert({
    merchant_id: params.merchantId,
    qb_invoice_id: params.qbInvoiceId,
    invoice_number: params.invoiceNumber,
    customer_email: params.customerEmail,
    customer_name: params.customerName,
    amount: params.amount,
    due_date: params.dueDate,
    email_type: params.emailType,
    resend_message_id: resendMessageId,
    status,
    error_message: errorMessage,
  });

  if (error) {
    console.error(`[Invoice Email] Failed to record email:`, error);
  }
}

// ─── Email HTML Template ─────────────────────────────────────────

interface EmailHtmlParams {
  businessName: string;
  customerName: string;
  headline: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string | null;
  payNowUrl: string;
  emailType: string;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEmailHtml(params: EmailHtmlParams): string {
  const { businessName, customerName, headline, invoiceNumber, amount, dueDate, payNowUrl, emailType } = params;

  const business = escapeHtml(businessName);
  const customer = escapeHtml(customerName);
  const invoice = escapeHtml(invoiceNumber);

  const formattedAmount = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(amount);

  const formattedDueDate = dueDate
    ? new Date(dueDate + 'T00:00:00').toLocaleDateString('en-US', {
        month: 'long', day: 'numeric', year: 'numeric',
      })
    : 'Upon receipt';

  const isOverdue = emailType.startsWith('overdue');
  const payColor = isOverdue ? '#DC2626' : '#2CA01C';
  const dueDateLabel = isOverdue ? 'Was Due' : 'Due Date';
  const dueColor = isOverdue ? '#DC2626' : '#111827';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoice}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:10px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.07);">

          <!-- Header: merchant brand -->
          <tr>
            <td style="background-color:#111827;padding:22px 32px;">
              <span style="color:#ffffff;font-size:18px;font-weight:700;letter-spacing:0.2px;">${business}</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 6px;color:#111827;font-size:17px;font-weight:600;line-height:1.4;">
                ${headline}
              </p>
              <p style="margin:0 0 24px;color:#555555;font-size:14px;line-height:1.5;">
                Hi ${customer}, here are the details and a secure link to pay.
              </p>

              <!-- Invoice Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-radius:8px;margin-bottom:24px;">
                <tr>
                  <td style="padding:22px 24px;">
                    <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</span><br>
                    <span style="color:#111827;font-size:30px;font-weight:700;">${formattedAmount}</span>
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-top:16px;border-top:1px solid #e9ecef;padding-top:14px;">
                      <tr>
                        <td style="padding-top:14px;width:50%;">
                          <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">Invoice #</span><br>
                          <span style="color:#111827;font-size:15px;font-weight:600;">${invoice}</span>
                        </td>
                        <td style="padding-top:14px;width:50%;">
                          <span style="color:#6b7280;font-size:12px;text-transform:uppercase;letter-spacing:0.5px;">${dueDateLabel}</span><br>
                          <span style="color:${dueColor};font-size:15px;font-weight:${isOverdue ? '700' : '600'};">${formattedDueDate}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Pay Now Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:4px 0 24px;">
                    <a href="${payNowUrl}" target="_blank" style="display:inline-block;background-color:${payColor};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 44px;border-radius:8px;">
                      Pay Now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#9ca3af;font-size:13px;line-height:1.5;text-align:center;">
                Questions about this invoice? Just reply to this email.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:18px 32px;border-top:1px solid #e9ecef;">
              <p style="margin:0;color:#9ca3af;font-size:12px;line-height:1.5;text-align:center;">
                Sent by ${business}. This is an automated payment notification &mdash; if you've already paid, please disregard.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`.trim();
}