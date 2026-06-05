// ============================================================
// POST /api/webhooks/dpp
// ============================================================
// Receives payment events from the DPP/Deluxe gateway.
// Deluxe does NOT sign its webhooks, so authentication is:
//   1. a high-entropy secret embedded in the registered webhook URL
//      (?token=<DPP_WEBHOOK_URL_SECRET>), verified in constant time
//   2. a source-IP allowlist (DPP_ALLOWED_IPS)
//   3. strict structural validation of the payload (Zod)
// then the event is synced to QuickBooks.

import { NextRequest, NextResponse } from "next/server";
import { PaymentSyncService } from "@/lib/quickbooks/payment-sync";
import { verifyDPPUrlSecret } from "@/lib/quickbooks/webhooks";
import { dppWebhookPayloadSchema } from "@/lib/sanitize";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { DPPTransaction } from "@/types";

// ── DPP Gateway Payload Types ─────────────────────────────────

interface DPPCustomerInfo {
  Name?: string;
  Address?: string;
  City?: string;
  State?: string;
  PostalCode?: string;
  Country?: string;
  EmailAddress?: string;
  Phone?: string;
  CompanyName?: string;
}

// Shape of the actual webhook Deluxe POSTs (verified against captured
// payloads). Most fields are optional because the Transaction and
// ACH Reject events carry very different field sets. Notably:
//   - Customer / Shipping arrive as JSON-encoded STRINGS, not objects.
//   - ACH Reject uses `Amount` (not `TransactionAmount`) and carries
//     OrderId / ReturnedCode / ReturnedDate / Description.
interface DPPWebhookPayload {
  EventType: string;
  MID: string;
  DbaName?: string;
  // Transaction event fields
  TransactionType?: string;
  PaymentType?: string;
  Currency?: string;
  TerminalId?: string;
  TransactionId?: string;
  DateTime?: string;
  TransactionAmount?: string;
  InvoiceNumber?: string;
  CardType?: string;
  CardNumber?: string;
  CardExpiration?: string;
  AchAccountNumber?: string;
  AchRoutingNumber?: string;
  AchAccountType?: string;
  Discount?: string;
  ProcessingFee?: string;
  Tip?: string;
  Tax?: string;
  Surcharge?: string;
  BatchNumber?: string;
  Status?: string;
  AuthCode?: string;
  AuthResponse?: string;
  CustomerId?: string;
  Customer?: string | DPPCustomerInfo;
  Shipping?: string | DPPCustomerInfo;
  SubmissionMethod?: string;
  // ACH Reject event fields
  OrderId?: string;
  Type?: string;
  ReturnedDate?: string;
  ReturnedCode?: string;
  Description?: string;
  Amount?: string;
}

// Customer/Shipping come over the wire as JSON strings — parse defensively.
function parseCustomerInfo(value: unknown): DPPCustomerInfo {
  if (!value) return {};
  if (typeof value === "object") return value as DPPCustomerInfo;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      return typeof parsed === "object" && parsed ? parsed : {};
    } catch {
      return {};
    }
  }
  return {};
}

function isAchReject(payload: DPPWebhookPayload): boolean {
  return (payload.EventType || "").toUpperCase() === "ACH REJECT";
}

// ── Transform DPP payload → our DPPTransaction type ──────────

function transformToDPPTransaction(payload: DPPWebhookPayload): DPPTransaction {
  const achReject = isAchReject(payload);

  let status: DPPTransaction["status"];
  if (achReject) {
    status = "failed";
  } else if (payload.Status === "APPROVED") {
    status = "completed";
  } else if (payload.Status === "DECLINED" || payload.Status === "ERROR") {
    status = "failed";
  } else if (payload.TransactionType === "REFUND") {
    status = "refunded";
  } else {
    status = "pending";
  }

  const paymentType = payload.PaymentType || "";
  let paymentMethod: string;
  if (paymentType === "CREDITCARD") {
    paymentMethod = `credit_card_${(payload.CardType || "").toLowerCase()}`;
  } else if (paymentType === "ACH" || achReject) {
    paymentMethod = "ach";
  } else {
    paymentMethod = paymentType.toLowerCase() || "unknown";
  }

  const customer = parseCustomerInfo(payload.Customer);
  const shipping = parseCustomerInfo(payload.Shipping);

  const customerEmail =
    customer.EmailAddress ||
    shipping.EmailAddress ||
    (payload.CustomerId
      ? `customer_${payload.CustomerId}@dpp-placeholder.com`
      : undefined);

  const customerName = customer.Name || shipping.Name || undefined;

  // ACH Reject uses `Amount`; transactions use `TransactionAmount`.
  const amount = parseFloat(payload.TransactionAmount || payload.Amount || "0") || 0;

  const rawDate = payload.DateTime || payload.ReturnedDate || "";
  const parsedDate = rawDate ? new Date(rawDate) : null;
  const createdAt =
    parsedDate && !isNaN(parsedDate.getTime())
      ? parsedDate.toISOString()
      : new Date().toISOString();

  const cardNumber = payload.CardNumber || "";

  return {
    id: payload.TransactionId || payload.OrderId || "",
    merchant_id: payload.MID,
    amount,
    currency: payload.Currency || "USD",
    status,
    customer_email: customerEmail,
    customer_name: customerName,
    payment_method: paymentMethod,
    created_at: createdAt,
    metadata: {
      invoice_number: payload.InvoiceNumber || "",
      order_id: payload.OrderId || "",
      auth_code: payload.AuthCode || "",
      card_type: payload.CardType || "",
      card_last_four: cardNumber.replace(/\*/g, "").slice(-4),
      batch_number: payload.BatchNumber || "",
      terminal_id: payload.TerminalId || "",
      tip: payload.Tip || "",
      tax: payload.Tax || "",
      surcharge: payload.Surcharge || "",
      dba_name: payload.DbaName || "",
      submission_method: payload.SubmissionMethod || "",
      returned_code: payload.ReturnedCode || "",
      returned_description: payload.Description || "",
    },
  };
}

// ── Determine event type from DPP payload ─────────────────────

type DPPEventType =
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.ach_rejected";

function getEventType(payload: DPPWebhookPayload): DPPEventType {
  // ACH returns/rejects arrive after settlement — a previously synced
  // payment must be reversed. Deluxe flags these via EventType.
  if (isAchReject(payload)) return "payment.ach_rejected";
  if (payload.TransactionType === "REFUND") return "payment.refunded";
  if (payload.Status === "APPROVED") return "payment.completed";
  return "payment.failed";
}

// Build the idempotency key. An ACH Reject typically carries the SAME
// TransactionId as the original payment, so it must be namespaced to avoid
// being skipped as a duplicate of the original payment's webhook.
function buildEventId(payload: DPPWebhookPayload, eventType: DPPEventType): string {
  const base = payload.TransactionId || payload.OrderId || "";
  if (eventType === "payment.ach_rejected") {
    return `ach_reject:${base}:${payload.ReturnedDate || payload.ReturnedCode || ""}`;
  }
  return base;
}

// ── Main Handler ──────────────────────────────────────────────

export async function POST(request: NextRequest) {
  const body = await request.text();

  // ── 1. Verify the URL-embedded shared secret (constant-time) ─
  // Deluxe does not sign webhooks; the secret lives in the registered
  // eventUri (?token=... or a trailing path segment).
  const url = new URL(request.url);
  const token =
    url.searchParams.get("token") || url.pathname.split("/").pop() || "";

  if (!verifyDPPUrlSecret(token)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // ── 2. Validate by source IP ────────────────────────────────
  const forwardedFor = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip") || "";
  const sourceIp = forwardedFor.split(",")[0].trim();
  const allowedIpsRaw = (process.env.DPP_ALLOWED_IPS || "").trim();

  if (!allowedIpsRaw) {
    // Require an allowlist in production; allow empty only in dev.
    if (process.env.NODE_ENV === "production") {
      logger.error("DPP webhook: DPP_ALLOWED_IPS not configured in production");
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
    logger.warn("DPP webhook: DPP_ALLOWED_IPS not set — skipping IP check (dev only)");
  } else {
    const allowedIps = allowedIpsRaw.split(",").map((ip: string) => ip.trim());
    if (!allowedIps.includes(sourceIp)) {
      logger.warn("DPP webhook: untrusted source IP", { sourceIp });
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }
  }

  // ── 3. Parse + strictly validate payload ────────────────────
  let raw: unknown;
  try {
    raw = JSON.parse(body);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const validation = dppWebhookPayloadSchema.safeParse(raw);
  if (!validation.success) {
    logger.warn("DPP webhook: payload validation failed", {
      errors: validation.error.issues,
    });
    return NextResponse.json({ error: "Invalid payload" }, { status: 400 });
  }

  const payload = validation.data as unknown as DPPWebhookPayload;
  const eventType = getEventType(payload);
  const eventId = buildEventId(payload, eventType);

  logger.info("DPP webhook received", {
    eventId,
    eventType: payload.EventType,
    resolvedEvent: eventType,
    transactionType: payload.TransactionType,
    status: payload.Status,
    amount: payload.TransactionAmount || payload.Amount,
    mid: payload.MID,
  });

  // ── Idempotency check ──────────────────────────────────────
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

  // ── Store the event ────────────────────────────────────────
  await supabase.from("webhook_events").insert({
    event_id: eventId,
    source: "dpp",
    event_type: eventType,
    payload: payload,
    processed: false,
  });

  // ── Respond immediately, process async ─────────────────────
  processEvent(payload, eventId, eventType).catch((err) => {
    logger.error("DPP webhook processing failed", {
      eventId,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ success: true });
}

// ── Async Processing ──────────────────────────────────────────

async function processEvent(
  payload: DPPWebhookPayload,
  eventId: string,
  eventType: string
) {
  const supabase = getSupabaseAdmin();
  const transaction = transformToDPPTransaction(payload);

  try {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, qb_connected, settings")
      .eq("dpp_merchant_id", payload.MID)
      .single();

    if (!merchant) {
      logger.warn("DPP webhook: no merchant found", { mid: payload.MID });
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
        const syncResult = await syncService.syncPayment(
          transaction,
          merchant.settings
        );

        const isSale = syncResult.kind === "sales_receipt";
        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: isSale ? "SalesReceipt" : "Payment",
          entity_id: transaction.id,
          qb_entity_id: syncResult.id,
          status: "success",
          payload: transaction,
          metadata: isSale
            ? { recorded_as: "sales_receipt", no_invoice: true }
            : {
                invoices_matched: syncResult.matchedCount,
                standalone: false,
              },
        });

        await markEvent(supabase, eventId, true);
        logger.info("DPP payment synced to QB", {
          transactionId: transaction.id,
          qbEntityId: syncResult.id,
          recordedAs: syncResult.kind,
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
        // Idempotency: skip if this refund already synced successfully.
        const { data: existingRefund } = await supabase
          .from("sync_log")
          .select("id")
          .eq("merchant_id", merchant.id)
          .eq("entity_type", "Refund")
          .eq("entity_id", transaction.id)
          .eq("status", "success")
          .limit(1)
          .maybeSingle();

        if (existingRefund) {
          logger.info("DPP refund already synced, skipping", {
            transactionId: transaction.id,
          });
          await markEvent(supabase, eventId, true);
          break;
        }

        const syncService = new PaymentSyncService(merchant.id);
        const refundReceipt = await syncService.refundPayment(
          transaction,
          merchant.settings
        );

        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Refund",
          entity_id: transaction.id,
          qb_entity_id: refundReceipt.Id,
          status: "success",
          payload: transaction,
        });

        await markEvent(supabase, eventId, true);
        logger.info("DPP refund synced to QB as RefundReceipt", {
          transactionId: transaction.id,
          qbRefundReceiptId: refundReceipt.Id,
          amount: transaction.amount,
        });
        break;
      }

      case "payment.ach_rejected": {
        await handleAchReject(supabase, merchant.id, transaction, payload);
        await markEvent(supabase, eventId, true);
        break;
      }

      default:
        logger.warn("DPP webhook: unknown event type", { eventType });
        await markEvent(supabase, eventId, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markEvent(supabase, eventId, false, message);

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

// ── ACH Reject Handling ───────────────────────────────────────
// An ACH payment that previously settled (and was synced to QB) has been
// returned. We reverse the QB payment when we can confidently identify the
// original; otherwise we flag it for manual review rather than risk
// deleting the wrong payment.

async function handleAchReject(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  merchantId: string,
  transaction: DPPTransaction,
  payload: DPPWebhookPayload
) {
  const original = await findOriginalSyncedPayment(
    supabase,
    merchantId,
    transaction,
    payload
  );

  if (!original?.qb_entity_id) {
    logger.warn("ACH reject: no matching synced payment found to reverse", {
      merchantId,
      rejectTransactionId: transaction.id,
      mid: payload.MID,
    });
    await supabase.from("sync_log").insert({
      merchant_id: merchantId,
      direction: "dpp_to_qb",
      entity_type: "Payment",
      entity_id: transaction.id,
      status: "skipped",
      payload: transaction,
      metadata: {
        reason: "ACH reject — no matching synced payment found",
        needs_review: true,
      },
    });
    return;
  }

  const syncService = new PaymentSyncService(merchantId);
  const deletedId = await syncService.reversePayment(original.qb_entity_id);

  await supabase.from("sync_log").insert({
    merchant_id: merchantId,
    direction: "dpp_to_qb",
    entity_type: "Payment",
    entity_id: transaction.id,
    qb_entity_id: deletedId,
    status: "success",
    payload: transaction,
    metadata: {
      reason: "ACH reject — synced payment reversed",
      original_qb_payment_id: original.qb_entity_id,
    },
  });

  logger.info("ACH reject: reversed synced QB payment", {
    merchantId,
    rejectTransactionId: transaction.id,
    qbPaymentId: deletedId,
  });
}

/**
 * Identify the original successfully-synced QB payment for an ACH reject.
 * Tries explicit original-transaction references first, then the reject's
 * own TransactionId (some gateways reuse it). Deliberately does NOT guess by
 * amount — for money operations we prefer to flag for review over reversing
 * the wrong payment.
 */
async function findOriginalSyncedPayment(
  supabase: ReturnType<typeof getSupabaseAdmin>,
  merchantId: string,
  transaction: DPPTransaction,
  payload: DPPWebhookPayload
): Promise<{ qb_entity_id: string } | null> {
  // The reject references the original transaction via TransactionId and/or
  // OrderId (verified against captured ACH Reject payloads). The original
  // payment was synced with sync_log.entity_id = its TransactionId/OrderId.
  const candidates = [
    payload.TransactionId,
    payload.OrderId,
    transaction.id,
  ].filter((v): v is string => typeof v === "string" && v.length > 0);

  for (const candidate of candidates) {
    const { data } = await supabase
      .from("sync_log")
      .select("qb_entity_id")
      .eq("merchant_id", merchantId)
      .eq("entity_type", "Payment")
      .eq("entity_id", candidate)
      .eq("status", "success")
      .not("qb_entity_id", "is", null)
      .limit(1)
      .maybeSingle();

    if (data?.qb_entity_id) {
      return { qb_entity_id: data.qb_entity_id as string };
    }
  }

  return null;
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
