// ============================================================
// POST /api/webhooks/quickbooks
// ============================================================
// Receives data change notifications from QuickBooks.
// All payloads MUST pass HMAC-SHA256 validation.
// Responds with 200 immediately, processes async.

import { NextRequest, NextResponse } from "next/server";
import { validateWebhookSignature } from "@/lib/quickbooks";
import { webhookPayloadSchema } from "@/lib/sanitize";
import { logger } from "@/lib/logger";
import { handleInvoiceEvent } from "@/lib/quickbooks/invoice-webhook";

export async function POST(request: NextRequest) {
  // ── Read the raw body ─────────────────────────────────────
  const body = await request.text();
  const signature = request.headers.get("intuit-signature") || "";

  // ── HMAC Validation (Intuit hard requirement) ─────────────
  if (!validateWebhookSignature(body, signature)) {
    logger.warn("QB webhook: HMAC validation failed");
    // Return 401 for invalid signatures
    return NextResponse.json(
      { error: "Invalid signature" },
      { status: 401 }
    );
  }

  // ── Parse and validate payload ────────────────────────────
  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    logger.warn("QB webhook: invalid JSON payload");
    return NextResponse.json(
      { error: "Invalid JSON" },
      { status: 400 }
    );
  }

  const validation = webhookPayloadSchema.safeParse(payload);
  if (!validation.success) {
    logger.warn("QB webhook: payload validation failed", {
      errors: validation.error.issues,
      // Bounded raw payload so we can see exactly what Intuit sent if this
      // ever fails again (QB payloads carry only entity ids/names, not PII).
      payloadSample: body.slice(0, 2000),
    });
    return NextResponse.json(
      { error: "Invalid payload" },
      { status: 400 }
    );
  }

  // ── Respond immediately (Intuit expects fast 200) ─────────
  // Process the webhook asynchronously to avoid timeout.

  logger.info("QB webhook received", {
    notifications: validation.data.eventNotifications.length,
  });

  // Fire-and-forget processing
  processWebhookAsync(validation.data).catch((err) => {
    logger.error("QB webhook async processing failed", {
      error: err instanceof Error ? err.message : String(err),
    });
  });

  return NextResponse.json({ success: true }, { status: 200 });
}

// ── Intuit also sends a GET for webhook verification ────────
export async function GET(request: NextRequest) {
  // Intuit sends a validation challenge during webhook setup.
  // It expects you to respond with a specific challenge token.
  const challenge = request.nextUrl.searchParams.get("challenge");

  if (challenge) {
    return new NextResponse(challenge, {
      status: 200,
      headers: { "Content-Type": "text/plain" },
    });
  }

  return NextResponse.json({ status: "webhook endpoint active" });
}

// ── Async Processing ────────────────────────────────────────

async function processWebhookAsync(
  payload: ReturnType<typeof webhookPayloadSchema.parse>
) {
  for (const notification of payload.eventNotifications) {
    const { realmId, dataChangeEvent } = notification;

    for (const entity of dataChangeEvent.entities) {
      logger.info("Processing webhook entity", {
        realmId,
        entityName: entity.name,
        entityId: entity.id,
        operation: entity.operation,
      });

      // Handle specific entity types
      switch (entity.name) {
        case "Payment":
          await handlePaymentChange(realmId, entity);
          break;
        case "Invoice":
          await handleInvoiceChange(realmId, entity);
          break;
        case "Customer":
          await handleCustomerChange(realmId, entity);
          break;
        default:
          logger.debug("Unhandled entity type", {
            name: entity.name,
            operation: entity.operation,
          });
      }
    }
  }
}

// ── Entity Handlers (extend as needed) ──────────────────────

async function handlePaymentChange(
  realmId: string,
  entity: { id: string; operation: string; name: string }
) {
  logger.info("Payment change detected", {
    realmId,
    paymentId: entity.id,
    operation: entity.operation,
  });
  // TODO: Sync payment status back to DPP gateway if needed
}

async function handleInvoiceChange(
  realmId: string,
  entity: { id: string; operation: string; name: string }
) {
  logger.info("Invoice change detected", {
    realmId,
    invoiceId: entity.id,
    operation: entity.operation,
  });

  await handleInvoiceEvent(
    {
      realmId,
      dataChangeEvent: {
        entities: [{
          name: 'Invoice' as const,
          id: entity.id,
          operation: entity.operation as 'Create' | 'Update' | 'Delete' | 'Void',
          lastUpdated: new Date().toISOString(),
        }],
      },
    },
    {
      name: 'Invoice' as const,
      id: entity.id,
      operation: entity.operation as 'Create' | 'Update' | 'Delete' | 'Void',
      lastUpdated: new Date().toISOString(),
    }
  );
}

async function handleCustomerChange(
  realmId: string,
  entity: { id: string; operation: string; name: string }
) {
  logger.info("Customer change detected", {
    realmId,
    customerId: entity.id,
    operation: entity.operation,
  });
  // TODO: Handle customer updates
}