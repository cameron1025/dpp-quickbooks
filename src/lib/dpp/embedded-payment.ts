// ============================================================
// Deluxe Embedded Payments — signed JWT builder
// ============================================================
// Builds the HS256 JWT the Embedded Payments SDK (deluxe.js) consumes to render a
// branded, in-page payment panel. Card data stays in Deluxe's iFrames (PCI SAQ A);
// the amount lives in the SERVER-SIGNED JWT, so the customer can't tamper it —
// same integrity as the hosted Payment Link.
//
// Reconciliation: the locked amount + the invoice number (sent as
// `transactionReference`, surfaced as the webhook's orderId) let the existing DPP
// TRANSACTION webhook → payment-sync flow match the payment to the right QB
// invoice — see [[dpp-payment-link-orderid]].

import { signJwtHS256 } from "./jwt";
import { DppCredentials } from "./credentials";

// Sandbox vs production SDK script differ; the JWT itself is environment-agnostic.
export const DELUXE_EMBEDDED_SCRIPT = {
  sandbox: "https://payments2.deluxe.com/embedded/javascripts/deluxe.js",
  production: "https://payments.deluxe.com/embedded/javascripts/deluxe.js",
} as const;

export interface EmbeddedPaymentParams {
  invoiceNumber: string;
  amount: number;
  currency?: string;
  customerName?: string;
  customerEmail?: string;
}

function splitName(full?: string): { firstName?: string; lastName?: string } {
  if (!full?.trim()) return {};
  const parts = full.trim().split(/\s+/);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

/**
 * Build + sign the Embedded Payments JWT for one invoice.
 * Throws if the merchant has no Signature Key configured for embedded checkout.
 */
export function createEmbeddedPaymentJwt(
  params: EmbeddedPaymentParams,
  creds: DppCredentials,
  opts: { iatSeconds?: number } = {}
): string {
  if (!creds.signatureKey) {
    throw new Error(
      "Missing Deluxe embedded Signature Key for this MID (configure it in admin)"
    );
  }
  if (!creds.partnerToken) {
    throw new Error("Missing Deluxe partnerToken (used as the embedded accessToken)");
  }

  const { firstName, lastName } = splitName(params.customerName);
  const hasCustomer = !!(firstName || lastName || params.customerEmail);

  const payload: Record<string, unknown> = {
    // accessToken === partnerToken (confirmed with Deluxe).
    accessToken: creds.partnerToken,
    amount: Number(params.amount.toFixed(2)),
    // Carries the invoice number into the transaction for reconciliation.
    transactionReference: params.invoiceNumber,
    // Invoice payment is a single locked charge — hide the cart/products panel.
    hideProductsPanel: true,
    ...(hasCustomer && {
      customer: {
        ...(firstName && { firstName }),
        ...(lastName && { lastName }),
        ...(params.customerEmail && { email: params.customerEmail }),
      },
    }),
    iat: opts.iatSeconds ?? Math.floor(Date.now() / 1000),
  };

  return signJwtHS256(payload, creds.signatureKey);
}
