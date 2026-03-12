/**
 * QB Invoice Webhook Handler
 * 
 * Extends the existing QB webhook route to handle Invoice events.
 * When a merchant creates an invoice in QB (Save, not Send), this
 * detects it, fetches details, and triggers the branded email flow.
 * 
 * Integration point: called from the existing /api/webhooks/quickbooks route
 * after HMAC validation passes. Add this to the event routing switch.
 */

import { createClient } from '@supabase/supabase-js';
import { QuickBooksClient } from '@/lib/quickbooks/client';
import { getValidTokens, storeTokens } from '@/lib/quickbooks/token-manager';
import { sendInvoiceEmail } from '@/lib/invoice-emails';
import { generatePayNowUrl } from '@/lib/pay-now-url';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

interface QBInvoiceEvent {
  name: 'Invoice';
  id: string;        // QB Invoice ID
  operation: 'Create' | 'Update' | 'Delete' | 'Void';
  lastUpdated: string;
}

interface QBWebhookNotification {
  realmId: string;
  dataChangeEvent: {
    entities: QBInvoiceEvent[];
  };
}

/**
 * Process Invoice events from QB webhook notifications.
 * Call this from the main QB webhook handler for Invoice entities.
 */
export async function handleInvoiceEvent(
  notification: QBWebhookNotification,
  entity: QBInvoiceEvent
): Promise<void> {
  const { realmId } = notification;
  const { id: invoiceId, operation } = entity;

  console.log(`[Invoice Webhook] ${operation} invoice ${invoiceId} for realm ${realmId}`);

  // Look up merchant by QB realm ID
  const { data: merchant, error: merchantErr } = await supabase
    .from('merchants')
    .select('*')
    .eq('qb_realm_id', realmId)
    .single();

  if (merchantErr || !merchant) {
    console.error(`[Invoice Webhook] No merchant found for realm ${realmId}`);
    return;
  }

  // Only process if reminders are enabled
  if (!merchant.reminders_enabled) {
    console.log(`[Invoice Webhook] Reminders disabled for merchant ${merchant.id}, skipping`);
    return;
  }

  switch (operation) {
    case 'Create':
      await handleInvoiceCreate(merchant, invoiceId, realmId);
      break;
    case 'Update':
      await handleInvoiceUpdate(merchant, invoiceId, realmId);
      break;
    case 'Delete':
    case 'Void':
      await handleInvoiceRemove(merchant, invoiceId);
      break;
    default:
      console.log(`[Invoice Webhook] Unhandled operation: ${operation}`);
  }
}

/**
 * New invoice created — fetch details, track it, send initial email
 */
async function handleInvoiceCreate(
  merchant: any,
  invoiceId: string,
  realmId: string
): Promise<void> {
  try {
    // Fetch invoice details from QB
    const tokens = await getValidTokens(merchant.id);
    if (!tokens) {
      console.error(`[Invoice Webhook] No valid tokens for merchant ${merchant.id}`);
      return;
    }
    const qbClient = new QuickBooksClient(tokens, {
      onTokenRefresh: async (newTokens) => {
        await storeTokens(merchant.id, newTokens);
      },
    });
    const result = await qbClient.getInvoice(invoiceId);
    const invoice = result?.Invoice || null;

    if (!invoice) {
      console.error(`[Invoice Webhook] Could not fetch invoice ${invoiceId}`);
      return;
    }

    // Skip if invoice is already paid
    if (invoice.Balance === 0) {
      console.log(`[Invoice Webhook] Invoice ${invoiceId} already paid, skipping`);
      return;
    }

    // Extract customer email
    const customerEmail = invoice.BillEmail?.Address;
    if (!customerEmail) {
      console.warn(`[Invoice Webhook] Invoice ${invoiceId} has no customer email, skipping`);
      return;
    }

    const customerName = invoice.CustomerRef?.name || 'Customer';
    const invoiceNumber = invoice.DocNumber || invoiceId;
    const amount = invoice.TotalAmt;
    const balanceDue = invoice.Balance;
    const dueDate = invoice.DueDate || null;

    // Extract billing address from QB invoice (if present)
    const billAddr = invoice.BillAddr || {};
    const customerPhone = invoice.PrimaryPhone?.FreeFormNumber;

    // Generate pre-filled DPP payment form URL
    const payNowUrl = generatePayNowUrl({
      merchantId: merchant.dpp_merchant_id,
      invoiceNumber,
      amount: balanceDue,
      customerEmail,
      customerName,
      customerPhone,
      billingAddress: {
        address: billAddr.Line1,
        city: billAddr.City,
        state: billAddr.CountrySubDivisionCode,
        zip: billAddr.PostalCode,
        country: billAddr.Country || 'US',
      },
    });

    // Upsert into tracked_invoices
    const { error: trackErr } = await supabase
      .from('tracked_invoices')
      .upsert({
        merchant_id: merchant.id,
        qb_invoice_id: invoiceId,
        invoice_number: invoiceNumber,
        customer_email: customerEmail,
        customer_name: customerName,
        amount,
        due_date: dueDate,
        balance_due: balanceDue,
        status: 'open',
        pay_now_url: payNowUrl,
        updated_at: new Date().toISOString(),
      }, {
        onConflict: 'merchant_id,qb_invoice_id',
      });

    if (trackErr) {
      console.error(`[Invoice Webhook] Failed to track invoice:`, trackErr);
      return;
    }

    // Send initial email if enabled
    if (merchant.reminder_send_initial) {
      await sendInvoiceEmail({
        merchantId: merchant.id,
        qbInvoiceId: invoiceId,
        invoiceNumber,
        customerEmail,
        customerName,
        amount: balanceDue,
        dueDate,
        payNowUrl,
        emailType: 'initial',
        fromName: merchant.reminder_from_name || 'Billing',
        replyTo: merchant.reminder_reply_to,
      });
    }

    console.log(`[Invoice Webhook] Tracked and emailed invoice ${invoiceNumber} to ${customerEmail}`);
  } catch (err) {
    console.error(`[Invoice Webhook] Error processing invoice create:`, err);
  }
}

/**
 * Invoice updated — refresh tracked data, check if paid
 */
async function handleInvoiceUpdate(
  merchant: any,
  invoiceId: string,
  realmId: string
): Promise<void> {
  try {
    const tokens = await getValidTokens(merchant.id);
    if (!tokens) return;
    const qbClient = new QuickBooksClient(tokens, {
      onTokenRefresh: async (newTokens) => {
        await storeTokens(merchant.id, newTokens);
      },
    });
    const result = await qbClient.getInvoice(invoiceId);
    const invoice = result?.Invoice || null;

    if (!invoice) return;

    const balanceDue = invoice.Balance;
    const isPaid = balanceDue === 0;

    const updateData: any = {
      balance_due: balanceDue,
      amount: invoice.TotalAmt,
      due_date: invoice.DueDate || null,
      invoice_number: invoice.DocNumber || invoiceId,
      updated_at: new Date().toISOString(),
    };

    if (isPaid) {
      updateData.status = 'paid';
      updateData.paid_at = new Date().toISOString();
    }

    // Update customer email if changed
    if (invoice.BillEmail?.Address) {
      updateData.customer_email = invoice.BillEmail.Address;
    }
    if (invoice.CustomerRef?.name) {
      updateData.customer_name = invoice.CustomerRef.name;
    }

    await supabase
      .from('tracked_invoices')
      .update(updateData)
      .eq('merchant_id', merchant.id)
      .eq('qb_invoice_id', invoiceId);

    if (isPaid) {
      console.log(`[Invoice Webhook] Invoice ${invoiceId} marked paid, reminders will stop`);
    }
  } catch (err) {
    console.error(`[Invoice Webhook] Error processing invoice update:`, err);
  }
}

/**
 * Invoice deleted or voided — stop tracking
 */
async function handleInvoiceRemove(
  merchant: any,
  invoiceId: string
): Promise<void> {
  await supabase
    .from('tracked_invoices')
    .update({
      status: 'voided',
      updated_at: new Date().toISOString(),
    })
    .eq('merchant_id', merchant.id)
    .eq('qb_invoice_id', invoiceId);

  console.log(`[Invoice Webhook] Invoice ${invoiceId} removed from tracking`);
}