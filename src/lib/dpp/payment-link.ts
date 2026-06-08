// ============================================================
// Deluxe/DPP Payment Links
// ============================================================
// Creates a hosted Deluxe payment link per invoice. Unlike the static Online
// Form, this lets us GUARANTEE the accepted payment methods (Card + ACH) and
// LOCK the amount to the invoice balance, while keeping all card/bank entry on
// Deluxe's PCI-compliant hosted page.
//
// Reconciliation: the locked amount equals the invoice balance, so the
// resulting transaction webhook matches the right invoice by exact amount even
// if the invoice number doesn't propagate; the invoice number is also sent in
// customData as a secondary match key.
//
// Uses the merchant's OWN Deluxe credentials so the link is created under
// their account and funds route to them.
// Optional env: DPP_API_BASE, DPP_ACCEPT_PAYMENT_METHODS (default "Card,ACH"),
//               DPP_PAYMENT_LINK_EXPIRY (default "9 DAYS")

import { getDeluxeAccessToken } from "./subscribe";
import { DppCredentials } from "./credentials";
import { logger } from "@/lib/logger";

function apiBase(): string {
  return process.env.DPP_API_BASE || "https://api.deluxe.com";
}

function acceptedMethods(): string[] {
  return (process.env.DPP_ACCEPT_PAYMENT_METHODS || "Card,ACH")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

function splitName(full?: string): { firstName?: string; lastName?: string } {
  if (!full?.trim()) return {};
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

export interface InvoicePaymentLinkParams {
  invoiceNumber: string;
  amount: number;
  currency?: string;
  customerName?: string;
}

export interface PaymentLinkResult {
  url: string;
  paymentLinkId?: string;
}

/**
 * Create a Deluxe payment link for an invoice (Card + ACH, amount locked).
 * Throws on failure so callers can fall back to the static form.
 */
export async function createInvoicePaymentLink(
  params: InvoicePaymentLinkParams,
  creds: DppCredentials
): Promise<PaymentLinkResult> {
  const partnerToken = creds.partnerToken;
  if (!partnerToken) throw new Error("Missing Deluxe partnerToken");

  const token = await getDeluxeAccessToken(creds);
  const { firstName, lastName } = splitName(params.customerName);

  const body = {
    amount: { amount: params.amount, currency: params.currency || "USD" },
    ...(firstName && { firstName }),
    ...(lastName && { lastName }),
    // Deluxe REQUIRES orderData.orderId — there is no auto-generate option
    // (confirmed against the DPP Payment Link spec). Suffix the invoice number
    // with a timestamp so regenerating a link for the same invoice (e.g. on each
    // reminder) never collides on Deluxe's unique-orderId constraint. The
    // invoice number remains the reconciliation match key, carried separately in
    // customData below.
    orderData: { orderId: `${params.invoiceNumber}-${Date.now().toString(36)}` },
    customData: [{ name: "Invoice Number", value: params.invoiceNumber }],
    paymentLinkExpiry: process.env.DPP_PAYMENT_LINK_EXPIRY || "9 DAYS",
    acceptPaymentMethod: acceptedMethods(),
    acceptBillingAddress: false,
    requiredBillingAddress: false,
    acceptPhone: false,
    requiredPhone: false,
    confirmationMessage: "Thank you for your payment!",
    // Note: deliveryMethod is intentionally omitted so Deluxe does NOT email
    // the link — PaySync sends the email.
  };

  const res = await fetch(`${apiBase()}/dpp/v1/paymentlinks`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      partnerToken,
    },
    body: JSON.stringify(body),
  });

  const text = await res.text();
  if (!res.ok) {
    throw new Error(`Deluxe payment link failed (HTTP ${res.status}): ${text}`);
  }

  const json = JSON.parse(text);
  const url = json.paymentLinkURL || json.paymentLinkUrl;
  if (!url) {
    throw new Error(`No paymentLinkURL in Deluxe response: ${text}`);
  }

  logger.info("Created Deluxe payment link", {
    invoiceNumber: params.invoiceNumber,
    amount: params.amount,
    paymentLinkId: json.paymentLinkId,
  });

  return { url, paymentLinkId: json.paymentLinkId };
}
