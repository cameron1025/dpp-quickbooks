// ============================================================
// Deluxe/DPP Webhook Subscription (server-side)
// ============================================================
// Subscribes a merchant's Deluxe MID to TRANSACTION + ACH REJECT events,
// pointing at our webhook endpoint. Server-side port of
// scripts/dpp-subscribe.mjs, used during automated onboarding.
//
// Requires env: DPP_CLIENT_ID, DPP_CLIENT_SECRET, DPP_PARTNER_TOKEN,
//               DPP_WEBHOOK_URL_SECRET, NEXT_PUBLIC_APP_URL
// Optional:     DPP_API_BASE (default https://api.deluxe.com),
//               DPP_SUBSCRIBE_USERNAME (defaults to the merchant's MID)

import { getSupabaseAdmin } from "@/lib/supabase";
import { logger } from "@/lib/logger";

const EVENT_TYPES = ["TRANSACTION", "ACH REJECT"] as const;

function apiBase(): string {
  return process.env.DPP_API_BASE || "https://api.deluxe.com";
}

interface SubscribeResultEntry {
  eventSubscriptionId?: string;
  eventType?: string;
  success?: boolean;
  message?: string[];
}

/**
 * Obtain a Deluxe API access token via client_credentials.
 */
export async function getDeluxeAccessToken(): Promise<string> {
  const clientId = process.env.DPP_CLIENT_ID;
  const clientSecret = process.env.DPP_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error("DPP_CLIENT_ID / DPP_CLIENT_SECRET not configured");
  }

  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  const res = await fetch(`${apiBase()}/secservices/oauth2/v2/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basic}`,
    },
    body: "grant_type=client_credentials",
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Deluxe token request failed (HTTP ${res.status}): ${text}`);
  }

  const json = JSON.parse(text);
  if (!json.access_token) {
    throw new Error("No access_token in Deluxe token response");
  }
  return json.access_token as string;
}

/**
 * Build the webhook eventUri (URL-embedded secret, since Deluxe doesn't sign).
 */
function buildEventUri(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://dpp-quickbooks-production.up.railway.app";
  const secret = process.env.DPP_WEBHOOK_URL_SECRET;
  if (!secret) throw new Error("DPP_WEBHOOK_URL_SECRET not configured");
  return `${base}/api/webhooks/dpp?token=${secret}`;
}

/**
 * Subscribe a MID's TRANSACTION + ACH REJECT events to our webhook.
 * Returns a map of eventType -> eventSubscriptionId.
 */
export async function subscribeMerchantWebhooks(
  mid: string
): Promise<Record<string, string>> {
  const partnerToken = process.env.DPP_PARTNER_TOKEN;
  if (!partnerToken) throw new Error("DPP_PARTNER_TOKEN not configured");

  const userName = process.env.DPP_SUBSCRIBE_USERNAME || mid;
  const eventUri = buildEventUri();
  const accessToken = await getDeluxeAccessToken();

  const res = await fetch(`${apiBase()}/dpp/v1/events/subscribe`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
      partnerToken,
    },
    body: JSON.stringify({
      userName,
      events: EVENT_TYPES.map((eventType) => ({ eventUri, eventType })),
    }),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Deluxe subscribe failed (HTTP ${res.status}): ${text}`);
  }

  const json = JSON.parse(text);
  const events: SubscribeResultEntry[] = json.events || [];

  const ids: Record<string, string> = {};
  for (const e of events) {
    if (e.success === false) {
      throw new Error(
        `Deluxe subscribe rejected ${e.eventType}: ${(e.message || []).join("; ")}`
      );
    }
    if (e.eventType && e.eventSubscriptionId) {
      ids[e.eventType] = e.eventSubscriptionId;
    }
  }

  return ids;
}

/**
 * Idempotently ensure a merchant's webhooks are subscribed.
 *
 * Skips if already subscribed (re-subscribing creates DUPLICATE Deluxe
 * subscriptions → duplicate webhook deliveries), unless `force` is set.
 * On failure, leaves dpp_subscribed_at null so it surfaces in the admin
 * health view and can be retried.
 */
export async function ensureWebhookSubscription(
  merchantId: string,
  mid: string,
  opts: { force?: boolean } = {}
): Promise<{ subscribed: boolean; ids?: Record<string, string>; skipped?: boolean }> {
  const supabase = getSupabaseAdmin();

  if (!opts.force) {
    const { data: merchant } = await supabase
      .from("merchants")
      .select("dpp_subscribed_at")
      .eq("id", merchantId)
      .single();

    if (merchant?.dpp_subscribed_at) {
      logger.info("DPP webhooks already subscribed, skipping", { merchantId, mid });
      return { subscribed: true, skipped: true };
    }
  }

  const ids = await subscribeMerchantWebhooks(mid);

  await supabase
    .from("merchants")
    .update({
      dpp_subscription_ids: ids,
      dpp_subscribed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", merchantId);

  logger.info("DPP webhooks subscribed for merchant", { merchantId, mid, ids });
  return { subscribed: true, ids };
}
