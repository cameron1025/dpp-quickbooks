// ============================================================
// POST /api/webhooks/dpp
// ============================================================
// Receives payment events from the DPP gateway.
// Validates HMAC-SHA256 signature, then syncs to QuickBooks.

import { NextRequest, NextResponse } from "next/server";
import { validateDPPWebhookSignature } from "@/lib/quickbooks/webhooks";
import { PaymentSyncService } from "@/lib/quickbooks/payment-sync";
import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";
import { DPPTransaction, DPPWebhookEvent } from "@/types";

export async function POST(request: NextRequest) {
  const body = await request.text();
  const signature = request.headers.get("x-dpp-signature") || "";

  // ── Validate HMAC signature ─────────────────────────────
  if (!validateDPPWebhookSignature(body, signature)) {
    logger.warn("DPP webhook: invalid signature");
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // ── Parse payload ───────────────────────────────────────
  let event: DPPWebhookEvent;
  try {
    event = JSON.parse(body);
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  // ── Idempotency check ──────────────────────────────────
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("webhook_events")
    .select("id")
    .eq("event_id", event.id)
    .single();

  if (existing) {
    logger.info("DPP webhook: duplicate event, skipping", {
      eventId: event.id,
    });
    return NextResponse.json({ success: true, message: "Already processed" });
  }

  // ── Store the event ────────────────────────────────────
  await supabase.from("webhook_events").insert({
    event_id: event.id,
    source: "dpp",
    event_type: event.type,
    payload: event,
    processed: false,
  });

  // ── Respond immediately ────────────────────────────────
  logger.info("DPP webhook received", {
    eventId: event.id,
    type: event.type,
  });

  // Process async
  processEvent(event).catch((err) => {
    logger.error("DPP webhook processing failed", {
      eventId: event.id,
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ success: true });
}

// ── Async Processing ────────────────────────────────────

async function processEvent(event: DPPWebhookEvent) {
  const supabase = getSupabaseAdmin();
  const transaction = event.data;

  try {
    // Find the merchant by DPP merchant ID
    const { data: merchant } = await supabase
      .from("merchants")
      .select("id, qb_connected")
      .eq("dpp_merchant_id", transaction.merchant_id)
      .single();

    if (!merchant) {
      logger.warn("DPP webhook: no merchant found", {
        dppMerchantId: transaction.merchant_id,
      });
      await markEvent(supabase, event.id, false, "Merchant not found");
      return;
    }

    if (!merchant.qb_connected) {
      logger.info("DPP webhook: merchant not connected to QB, skipping", {
        merchantId: merchant.id,
      });
      await markEvent(supabase, event.id, false, "QuickBooks not connected");
      return;
    }

    switch (event.type) {
      case "payment.completed": {
        const syncService = new PaymentSyncService(merchant.id);
        const qbPayment = await syncService.syncPayment(transaction);

        // Log the sync
        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Payment",
          entity_id: transaction.id,
          qb_entity_id: qbPayment.Id,
          status: "success",
        });

        await markEvent(supabase, event.id, true);
        logger.info("DPP payment synced to QB", {
          transactionId: transaction.id,
          qbPaymentId: qbPayment.Id,
        });
        break;
      }

      case "payment.failed": {
        // Log but don't sync failed payments to QB
        await supabase.from("sync_log").insert({
          merchant_id: merchant.id,
          direction: "dpp_to_qb",
          entity_type: "Payment",
          entity_id: transaction.id,
          status: "skipped",
          metadata: { reason: "Payment failed at gateway" },
        });
        await markEvent(supabase, event.id, true);
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
          metadata: { reason: "Refund handling not yet implemented" },
        });
        await markEvent(supabase, event.id, true);
        logger.info("DPP refund received, logged for manual processing", {
          transactionId: transaction.id,
        });
        break;
      }

      default:
        logger.warn("DPP webhook: unknown event type", {
          type: event.type,
        });
        await markEvent(supabase, event.id, true);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await markEvent(supabase, event.id, false, message);

    // Log sync failure
    await supabase.from("sync_log").insert({
      merchant_id: transaction.merchant_id,
      direction: "dpp_to_qb",
      entity_type: "Payment",
      entity_id: transaction.id,
      status: "failed",
      error_message: message,
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