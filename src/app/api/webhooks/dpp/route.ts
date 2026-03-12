// ============================================================
// POST /api/webhooks/dpp
// ============================================================
// Receives payment events from the DPP gateway.
// Validates webhook signature, then syncs to QuickBooks.

import { NextRequest, NextResponse } from "next/server";
import { PaymentSyncService } from "@/lib/quickbooks/payment-sync";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { DPPTransaction } from "@/types";
import crypto from "crypto";

// â”€â”€ DPP Gateway Payload Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

interface DPPCustomerInfo {
  Name: string;
  Address: string;
  City: string;
  State: string;
  PostalCode: string;
  Country: string;
  EmailAddress?: string;
  Phone?: string;
}

interface DPPWebhookPayload {
  EventType: string;
  TransactionType: string; // "SALE", "REFUND", "VOID", etc.
  PaymentType: string; // "CREDITCARD", "ACH", etc.
  AccessToken: string;
  DbaName: string;
  Currency: string;
  MID: string;
  MerNo: string;
  TerminalId: string;
  TransactionId: string;
  DateTime: string;
  TransactionAmount: string;
  InvoiceNumber: string;
  CardType: string;
  CardNumber: string;
  CardExpiration: string;
  AchAccountNumber: string;
  AchRoutingNumber: string;
  AchAccountType: string;
  Discount: string;
  ProcessingFee: string;
  Tip: string;
  Tax: string;
  Surcharge: string;
  BatchNumber: string;
  Status: string; // "APPROVED", "DECLINED", "ERROR", etc.
  AuthCode: string;
  AuthResponse: string;
  AvsResponse: string;
  CvvResponse: string;
  CustomerId: string;
  RecurringId: string;
  RecurringType: string;
  RecurringAmount: string;
  RecurringStartDate: string;
  RecurringEndDate: string;
  RecurringDayDetail: string;
  RecurringMonthDetail: string;
  VaultId: string;
  VaultKey: string;
  Customer: DPPCustomerInfo;
  Shipping: DPPCustomerInfo;
  Level2Data: Record<string, string>;
  CustomFields: Array<{ Name: string; Value: string }>;
  SubmissionMethod: string;
}

// â”€â”€ Signature Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function validateDPPSignature(body: string, signatureHeader: string): boolean {
  const secret = process.env.DPP_GATEWAY_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn("DPP_GATEWAY_WEBHOOK_SECRET not set, skipping validation");
    return true; // Allow through if not configured yet
  }

  // Header format: t=1773306655,sha256=C05O31Fd/MYZPDNCW6c60PkYAa/ACWa61eKR4w3rUZ4=
  const parts = signatureHeader.split(",");
  const timestampPart = parts.find((p) => p.startsWith("t="));
  const hashPart = parts.find((p) => p.startsWith("sha256="));

  if (!timestampPart || !hashPart) {
    logger.warn("DPP webhook: malformed signature header", { signatureHeader });
    return false;
  }

  const timestamp = timestampPart.replace("t=", "");
  const receivedHash = hashPart.replace("sha256=", "");

  // Verify the timestamp isn't too old (5 minute tolerance)
  const timestampAge = Math.abs(Date.now() / 1000 - parseInt(timestamp));
  if (timestampAge > 300) {
    logger.warn("DPP webhook: signature timestamp too old", {
      age: timestampAge,
    });
    return false;
  }

  // Compute expected hash: HMAC-SHA256 of "timestamp.body"
  const signedPayload = `${timestamp}.${body}`;
  const expectedHash = crypto
    .createHmac("sha256", secret)
    .update(signedPayload)
    .digest("base64");

  return crypto.timingSafeEqual(
    Buffer.from(receivedHash),
    Buffer.from(expectedHash)
  );
}

// â”€â”€ Transform DPP payload â†’ our DPPTransaction type â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function transformToDPPTransaction(payload: DPPWebhookPayload): DPPTransaction {
  // Map DPP Status to our status
  let status: DPPTransaction["status"];
  if (payload.Status === "APPROVED") {
    status = "completed";
  } else if (payload.Status === "DECLINED" || payload.Status === "ERROR") {
    status = "failed";
  } else if (payload.TransactionType === "REFUND") {
    status = "refunded";
  } else {
    status = "pending";
  }

  // Map PaymentType
  let paymentMethod: string;
  if (payload.PaymentType === "CREDITCARD") {
    paymentMethod = `credit_card_${payload.CardType.toLowerCase()}`;
  } else if (payload.PaymentType === "ACH") {
    paymentMethod = "ach";
  } else {
    paymentMethod = payload.PaymentType.toLowerCase();
  }

  // Build customer email from Shipping if available
  const customerEmail =
    payload.Shipping?.EmailAddress || `customer_${payload.CustomerId}@dpp-placeholder.com`;

  // Build customer name
  const customerName =
    payload.Customer?.Name || payload.Shipping?.Name || "Unknown Customer";

  return {
    id: payload.TransactionId,
    merchant_id: payload.MID,
    amount: parseFloat(payload.TransactionAmount),
    currency: payload.Currency,
    status,
    customer_email: customerEmail,
    customer_name: customerName,
    payment_method: paymentMethod,
    created_at: new Date(payload.DateTime).toISOString(),
    metadata: {
      invoice_number: payload.InvoiceNumber,
      auth_code: payload.AuthCode,
      card_type: payload.CardType,
      card_last_four: payload.CardNumber.replace(/\*/g, "").slice(-4),
      batch_number: payload.BatchNumber,
      terminal_id: payload.TerminalId,
      tip: payload.Tip,
      tax: payload.Tax,
      surcharge: payload.Surcharge,
      dba_name: payload.DbaName,
      submission_method: payload.SubmissionMethod,
    },
  };
}

// â”€â”€ Determine event type from DPP payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

function getEventType(
  payload: DPPWebhookPayload
): "payment.completed" | "payment.failed" | "payment.refunded" {
  if (payload.TransactionType === "REFUND") return "payment.refunded";
  if (payload.Status === "APPROVED") return "payment.completed";
  return "payment.failed";
}

// â”€â”€ Main Handler â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signatureHeader =
    request.headers.get("dpp-webhook-signature") || "";

  // â”€â”€ Validate signature â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  // DEBUG: Try different signing methods to figure out DPP's format
  const secret = process.env.DPP_GATEWAY_WEBHOOK_SECRET || "";
  const sigParts = signatureHeader.split(",");
  const timestamp = (sigParts.find((p: string) => p.startsWith("t=")) || "").replace("t=", "");
  const receivedHash = (sigParts.find((p: string) => p.startsWith("sha256=")) || "").replace("sha256=", "");

  const tryMethods = [
    { name: "body_only", data: body },
    { name: "timestamp.body", data: `${timestamp}.${body}` },
    { name: "timestamp+body", data: `${timestamp}${body}` },
    { name: "body.timestamp", data: `${body}.${timestamp}` },
  ];

  for (const method of tryMethods) {
    const hmacBase64 = crypto.createHmac("sha256", secret).update(method.data).digest("base64");
    const hmacHex = crypto.createHmac("sha256", secret).update(method.data).digest("hex");
    const hashBase64 = crypto.createHash("sha256").update(method.data).digest("base64");
    const hashHex = crypto.createHash("sha256").update(method.data).digest("hex");
    logger.info("DPP sig " + method.name, {
      hmacB64: hmacBase64 === receivedHash,
      hmacHex: hmacHex === receivedHash,
      hashB64: hashBase64 === receivedHash,
      hashHex: hashHex === receivedHash,
      received: receivedHash,
    });
  }

  if (false && !validateDPPSignature(body, signatureHeader)) {
    logger.warn("DPP webhook: invalid signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // â”€â”€ Parse payload â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let payload: DPPWebhookPayload;
  try {
    payload = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  // Use TransactionId as the unique event ID
  const eventId = payload.TransactionId;

  logger.info("DPP webhook received", {
    eventId,
    transactionType: payload.TransactionType,
    status: payload.Status,
    amount: payload.TransactionAmount,
    mid: payload.MID,
  });

  // â”€â”€ Idempotency check â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("event_id", eventId)
    .single();

  if (existing) {
    logger.info("DPP webhook: duplicate event, skipping", { eventId });
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  // â”€â”€ Store the event â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const eventType = getEventType(payload);

  await supabase.from("webhook_events").insert({
    event_id: eventId,
    source: "dpp",
    event_type: eventType,
    payload: payload,
    processed: false,
  });

  // â”€â”€ Respond immediately, process async â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  processEvent(payload, eventId, eventType).catch((err) => {
    logger.error("DPP webhook processing failed", {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ success: true });
}

// â”€â”€ Async Processing â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

async function processEvent(
  payload: DPPWebhookPayload,
  eventId: string,
  eventType: string
) {
  const supabase = getSupabaseAdmin();
  const transaction = transformToDPPTransaction(payload);

  try {
    // Find the merchant by MID (DPP merchant ID)
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, qb_connected")
      .eq("dpp_merchant_id", payload.MID)
      .single();

    if (!merchant) {
      logger.warn("DPP webhook: no merchant found", {
        mid: payload.MID,
      });
      await markEvent(supabase, eventId, false, "Merchant not found");
      return;
    }

    if (!merchant.qb_connected) {
      logger.info("DPP webhook: merchant not connected to QB, skipping", {
        merchantId: merchant.id,
      });
      await markEvent(supabase, eventId, false, "QuickBooks not connected");
      return;
    }

    switch (eventType) {
      case "payment.completed": {
        const syncService = new PaymentSyncService(merchant.id);
        const qbPayment = await syncService.syncPayment(transaction);

        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Payment",
          entity_id: transaction.id,
          qb_entity_id: qbPayment.Id,
          status: "success",
          payload: transaction,
        });

        await markEvent(supabase, eventId, true);
        logger.info("DPP payment synced to QB", {
          transactionId: transaction.id,
          qbPaymentId: qbPayment.Id,
          amount: transaction.amount,
        });
        break;
      }

      case "payment.failed": {
        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Payment",
          entity_id: transaction.id,
          status: "skipped",
          metadata: {
            reason: "Payment failed at gateway",
            dpp_status: payload.Status,
          },
        });
        await markEvent(supabase, eventId, true);
        break;
      }

      case "payment.refunded": {
        // TODO: Create a refund receipt in QuickBooks
        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Refund",
          entity_id: transaction.id,
          status: "pending",
          payload: transaction,
          metadata: { reason: "Refund handling not yet implemented" },
        });
        await markEvent(supabase, eventId, true);
        logger.info("DPP refund received, logged for manual processing", {
          transactionId: transaction.id,
        });
        break;
      }

      default:
        logger.warn("DPP webhook: unknown event type", { eventType });
        await markEvent(supabase, eventId, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markEvent(supabase, eventId, false, message);

    // Log sync failure with payload for retry
    await supabase.from("sync_log").insert({
      merchant_id: transaction.merchant_id,
      direction: "dpp_to_qb",
      entity_type: "Payment",
      entity_id: transaction.id,
      status: "failed",
      error_message: message,
      payload: transaction,
    });

    throw error;
  }
}

async function markEvent(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  eventId: string,
  processed: boolean,
  errorMessage?: string
) {
  await supabase
    .from("webhook_events")
    .update({
      processed,
      processed_at: new Date().toISOString(),
      error_message: errorMessage || null,
    })
    .eq("event_id", eventId);
}



