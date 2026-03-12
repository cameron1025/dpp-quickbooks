/**
 * Invoice Email Sender
 * 
 * Sends branded invoice notification and reminder emails via Resend.
 * Uses the same Resend integration pattern from email-notifications.ts.
 * 
 * Requires env vars: RESEND_API_KEY, ALERT_EMAIL_FROM
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
    amount, dueDate, payNowUrl, emailType, fromName, replyTo,
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
  const FROM_EMAIL = process.env.ALERT_EMAIL_FROM;

  if (!RESEND_API_KEY || !FROM_EMAIL) {
    console.warn('[Invoice Email] RESEND_API_KEY or ALERT_EMAIL_FROM not configured');
    // Record the attempt so we don't retry endlessly
    await recordEmail(params, null, 'failed', 'Email service not configured');
    return false;
  }

  const subject = EMAIL_SUBJECTS[emailType]?.(invoiceNumber) || `Invoice ${invoiceNumber}`;
  const headline = EMAIL_HEADLINES[emailType] || 'Invoice notification';
  const html = buildEmailHtml({
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
        from: `${fromName || 'Billing'} <${FROM_EMAIL}>`,
        to: [customerEmail],
        subject,
        html,
        ...(replyTo && { reply_to: replyTo }),
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
  customerName: string;
  headline: string;
  invoiceNumber: string;
  amount: number;
  dueDate: string | null;
  payNowUrl: string;
  emailType: string;
}

function buildEmailHtml(params: EmailHtmlParams): string {
  const { customerName, headline, invoiceNumber, amount, dueDate, payNowUrl, emailType } = params;

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
  const accentColor = isOverdue ? '#DC3545' : '#2E75B6';
  const dueDateLabel = isOverdue ? 'Was Due' : 'Due Date';

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Invoice ${invoiceNumber}</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f4f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f7;">
    <tr>
      <td align="center" style="padding:40px 20px;">
        <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.08);">
          
          <!-- Header -->
          <tr>
            <td style="background-color:${accentColor};padding:24px 32px;">
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td>
                    <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:600;">
                      ${headline}
                    </h1>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:32px;">
              <p style="margin:0 0 20px;color:#333333;font-size:16px;line-height:1.5;">
                Hi ${customerName},
              </p>

              <!-- Invoice Details Card -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8f9fa;border-radius:6px;margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="color:#666666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Invoice #</span><br>
                          <span style="color:#333333;font-size:16px;font-weight:600;">${invoiceNumber}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-bottom:12px;">
                          <span style="color:#666666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">Amount Due</span><br>
                          <span style="color:#333333;font-size:24px;font-weight:700;">${formattedAmount}</span>
                        </td>
                      </tr>
                      <tr>
                        <td>
                          <span style="color:#666666;font-size:13px;text-transform:uppercase;letter-spacing:0.5px;">${dueDateLabel}</span><br>
                          <span style="color:${isOverdue ? '#DC3545' : '#333333'};font-size:16px;font-weight:${isOverdue ? '700' : '600'};">${formattedDueDate}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Pay Now Button -->
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${payNowUrl}" target="_blank" style="display:inline-block;background-color:${accentColor};color:#ffffff;text-decoration:none;font-size:16px;font-weight:600;padding:14px 40px;border-radius:6px;">
                      Pay Now
                    </a>
                  </td>
                </tr>
              </table>

              <p style="margin:0;color:#999999;font-size:13px;line-height:1.5;text-align:center;">
                Questions about this invoice? Reply to this email and we'll be happy to help.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8f9fa;padding:20px 32px;border-top:1px solid #e9ecef;">
              <p style="margin:0;color:#999999;font-size:12px;line-height:1.5;text-align:center;">
                This is an automated payment notification. If you've already paid, please disregard.
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