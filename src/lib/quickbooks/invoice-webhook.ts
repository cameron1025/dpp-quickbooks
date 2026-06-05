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
import { createInvoicePaymentLink } from '@/lib/dpp/payment-link';
import { getMerchantDppCredentials } from '@/lib/dpp/credentials';

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

    // Create a payment link under the CLIENT's own Deluxe account (guarantees
    // Card + ACH, locks the amount). If their credentials are missing or the
    // API fails, we do NOT send a misrouted link — skip and surface it
    // (reminders will retry once credentials/API are healthy).
    let payNowUrl: string | null = null;
    try {
      const creds = await getMerchantDppCredentials(merchant.dpp_merchant_id);
      const link = await createInvoicePaymentLink(
        { invoiceNumber, amount: balanceDue, customerName },
        creds
      );
      payNowUrl = link.url;
    } catch (linkErr) {
      console.error(
        `[Invoice Webhook] Could not create payment link for invoice ${invoiceId} (MID ${merchant.dpp_merchant_id}):`,
        linkErr
      );
    }

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

    // Mode: 'qb_native' embeds the pay link in the QB invoice (rides QB's own
    // email / PDF / hosted view); 'paysync' (default) sends PaySync's own email.
    const mode = merchant.invoice_email_mode || 'paysync';

    if (mode === 'qb_native') {
      if (payNowUrl) {
        try {
          const existingMemo = invoice.CustomerMemo?.value || '';
          if (existingMemo.includes('Pay online:')) {
            console.log(`[Invoice Webhook] Invoice ${invoiceNumber} already has a pay link in its memo; skipping embed.`);
          } else {
            const newMemo = existingMemo
              ? `${existingMemo}\n\nPay online: ${payNowUrl}`
              : `Pay online: ${payNowUrl}`;
            await qbClient.updateInvoiceMemo(invoiceId, invoice.SyncToken || '', newMemo);
            console.log(`[Invoice Webhook] Embedded pay link in QB invoice ${invoiceNumber} (qb_native mode).`);
          }
        } catch (memoErr) {
          console.error(`[Invoice Webhook] Failed to embed pay link in invoice ${invoiceId}:`, memoErr);
        }
      } else {
        console.warn(`[Invoice Webhook] Invoice ${invoiceNumber} in qb_native mode but no payment link (check Deluxe credentials for MID ${merchant.dpp_merchant_id}).`);
      }
      // qb_native mode: PaySync does not send its own initial email — the link
      // travels with QuickBooks' invoice. Reminders still operate as a backstop.
      return;
    }

    // paysync mode (default) — PaySync sends the branded initial email.
    // Only send when the merchant did NOT send it
    // from QuickBooks (EmailStatus = NotSet). If they used "Save and send",
    // QB already emailed the customer — we stay out to avoid a duplicate (the
    // Deluxe pay link still reaches them via the first reminder).
    const sentFromQB =
      invoice.EmailStatus === 'EmailSent' || invoice.EmailStatus === 'NeedToSend';

    if (merchant.reminder_send_initial && !sentFromQB && payNowUrl) {
      // Attach the QB-branded invoice PDF so the email looks native.
      // Best-effort: still send (without attachment) if the PDF fetch fails.
      let attachment: { filename: string; content: string } | undefined;
      try {
        const pdfBase64 = await qbClient.getInvoicePdf(invoiceId);
        attachment = { filename: `Invoice-${invoiceNumber}.pdf`, content: pdfBase64 };
      } catch (pdfErr) {
        console.warn(`[Invoice Webhook] Could not fetch PDF for invoice ${invoiceId}:`, pdfErr);
      }

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
        attachment,
      });
      console.log(`[Invoice Webhook] Tracked + emailed invoice ${invoiceNumber} to ${customerEmail}`);
    } else if (sentFromQB) {
      console.log(`[Invoice Webhook] Invoice ${invoiceNumber} sent from QuickBooks (EmailStatus=${invoice.EmailStatus}); tracked for reminders, skipped initial email.`);
    } else if (merchant.reminder_send_initial && !payNowUrl) {
      console.warn(`[Invoice Webhook] Invoice ${invoiceNumber} tracked but no payment link (check Deluxe credentials for MID ${merchant.dpp_merchant_id}); initial email skipped — reminders will retry.`);
    } else {
      console.log(`[Invoice Webhook] Invoice ${invoiceNumber} tracked; initial email disabled for merchant.`);
    }
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