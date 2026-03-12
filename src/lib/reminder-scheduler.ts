/**
 * Reminder Scheduler
 * 
 * Checks all tracked open invoices against each merchant's reminder schedule
 * and sends appropriate reminders. Designed to be called via cron (Railway 
 * cron job or Supabase Edge Function on a schedule).
 * 
 * Call via: POST /api/invoices/reminders (protected endpoint)
 * Recommended schedule: Every hour (reminders are date-based, so frequency 
 * just controls how quickly after midnight they go out)
 */

import { createClient } from '@supabase/supabase-js';
import { sendInvoiceEmail } from '@/lib/invoice-emails';
import { QuickBooksClient } from '@/lib/quickbooks/client';
import { getValidTokens, storeTokens } from '@/lib/quickbooks/token-manager';

type EmailType = 'initial' | 'before_due' | 'due_today' | 'overdue_3' | 'overdue_7' | 'overdue_14';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface ReminderResult {
  processed: number;
  sent: number;
  skipped: number;
  errors: number;
}

/**
 * Main scheduler entry point.
 * Iterates all merchants with reminders enabled, checks their open invoices.
 */
export async function runReminderScheduler(): Promise<ReminderResult> {
  const result: ReminderResult = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  // Get all merchants with reminders enabled
  const { data: merchants, error: merchantErr } = await supabase
    .from('merchants')
    .select('*')
    .eq('reminders_enabled', true)
    .eq('qb_connected', true);

  if (merchantErr || !merchants?.length) {
    console.log('[Reminder Scheduler] No merchants with reminders enabled');
    return result;
  }

  console.log(`[Reminder Scheduler] Processing ${merchants.length} merchant(s)`);

  for (const merchant of merchants) {
    try {
      const merchantResult = await processRemindersForMerchant(merchant);
      result.processed += merchantResult.processed;
      result.sent += merchantResult.sent;
      result.skipped += merchantResult.skipped;
      result.errors += merchantResult.errors;
    } catch (err) {
      console.error(`[Reminder Scheduler] Error for merchant ${merchant.id}:`, err);
      result.errors++;
    }
  }

  console.log(`[Reminder Scheduler] Complete:`, result);
  return result;
}

async function processRemindersForMerchant(merchant: any): Promise<ReminderResult> {
  const result: ReminderResult = { processed: 0, sent: 0, skipped: 0, errors: 0 };

  // Get all open tracked invoices for this merchant
  const { data: invoices, error: invoiceErr } = await supabase
    .from('tracked_invoices')
    .select('*')
    .eq('merchant_id', merchant.id)
    .eq('status', 'open');

  if (invoiceErr || !invoices?.length) {
    return result;
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  for (const invoice of invoices) {
    result.processed++;

    // Refresh balance from QB to catch payments made outside our flow
    const refreshed = await refreshInvoiceBalance(merchant, invoice);
    if (!refreshed || refreshed.status !== 'open') {
      result.skipped++;
      continue;
    }

    const dueDate = invoice.due_date ? new Date(invoice.due_date + 'T00:00:00') : null;
    if (!dueDate) {
      result.skipped++;
      continue;
    }

    const daysUntilDue = Math.floor((dueDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    const emailType = determineReminderType(daysUntilDue, merchant);

    if (!emailType) {
      result.skipped++;
      continue;
    }

    try {
      const sent = await sendInvoiceEmail({
        merchantId: merchant.id,
        qbInvoiceId: invoice.qb_invoice_id,
        invoiceNumber: invoice.invoice_number,
        customerEmail: invoice.customer_email,
        customerName: invoice.customer_name || 'Customer',
        amount: invoice.balance_due,
        dueDate: invoice.due_date,
        payNowUrl: invoice.pay_now_url || '#',
        emailType: emailType as EmailType,
        fromName: merchant.reminder_from_name,
        replyTo: merchant.reminder_reply_to,
      });

      if (sent) result.sent++;
      else result.skipped++; // Already sent (idempotency) or config missing
    } catch (err) {
      console.error(`[Reminder Scheduler] Failed to send ${emailType} for invoice ${invoice.invoice_number}:`, err);
      result.errors++;
    }
  }

  return result;
}

/**
 * Determine which reminder type to send based on days until due and merchant settings.
 * Returns null if no reminder should be sent.
 * 
 * Priority: most urgent/relevant type wins. The idempotency check in
 * sendInvoiceEmail prevents duplicates, so we just pick the right type.
 */
function determineReminderType(
  daysUntilDue: number,
  merchant: any
): string | null {
  // Overdue reminders (negative days = past due)
  if (daysUntilDue <= -14 && merchant.reminder_overdue_14) return 'overdue_14';
  if (daysUntilDue <= -7 && daysUntilDue > -14 && merchant.reminder_overdue_7) return 'overdue_7';
  if (daysUntilDue <= -3 && daysUntilDue > -7 && merchant.reminder_overdue_3) return 'overdue_3';

  // Due today
  if (daysUntilDue === 0 && merchant.reminder_on_due_date) return 'due_today';

  // Before due (configurable days)
  const beforeDays = merchant.reminder_before_due_days || 3;
  if (daysUntilDue === beforeDays && merchant.reminder_before_due_days > 0) return 'before_due';

  return null;
}

/**
 * Refresh invoice balance from QB to catch external payments.
 * Updates tracked_invoices if status changed.
 */
async function refreshInvoiceBalance(merchant: any, invoice: any): Promise<any> {
  try {
    const tokens = await getValidTokens(merchant.id);
    if (!tokens) {
      console.error(`[Reminder Scheduler] No valid tokens for merchant ${merchant.id}`);
      return invoice;
    }
    const qbClient = new QuickBooksClient(tokens, {
      onTokenRefresh: async (newTokens) => {
        await storeTokens(merchant.id, newTokens);
      },
    });
    const result = await qbClient.getInvoice(invoice.qb_invoice_id);
    const qbInvoice = result?.Invoice || null;

    if (!qbInvoice) {
      // Invoice deleted in QB — mark as voided
      await supabase
        .from('tracked_invoices')
        .update({ status: 'voided', updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
      return { ...invoice, status: 'voided' };
    }

    const balance = qbInvoice.Balance;
    const isPaid = balance === 0;

    if (isPaid || qbInvoice.Status === 'Voided') {
      const newStatus = qbInvoice.Status === 'Voided' ? 'voided' : 'paid';
      await supabase
        .from('tracked_invoices')
        .update({
          balance_due: balance,
          status: newStatus,
          ...(isPaid && { paid_at: new Date().toISOString() }),
          updated_at: new Date().toISOString(),
        })
        .eq('id', invoice.id);
      return { ...invoice, status: newStatus };
    }

    // Update balance if changed
    if (balance !== invoice.balance_due) {
      await supabase
        .from('tracked_invoices')
        .update({ balance_due: balance, updated_at: new Date().toISOString() })
        .eq('id', invoice.id);
    }

    return { ...invoice, balance_due: balance, status: 'open' };
  } catch (err) {
    console.error(`[Reminder Scheduler] Failed to refresh invoice ${invoice.qb_invoice_id}:`, err);
    // Return current data if refresh fails — don't skip the reminder
    return invoice;
  }
}