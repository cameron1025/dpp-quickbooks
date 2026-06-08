// Public, customer-facing branded payment page.
// /pay/<token> → verify token → load tracked invoice + merchant branding + Deluxe
// creds → build a server-signed Embedded Payments JWT → render the in-page panel.
// No auth: the HMAC token is the capability. Card data stays in Deluxe's iFrames.

import { getSupabaseAdmin } from "@/lib/supabase";
import { verifyPayToken } from "@/lib/dpp/pay-token";
import { getMerchantDppCredentialsOrNull } from "@/lib/dpp/credentials";
import { createEmbeddedPaymentJwt, DELUXE_EMBEDDED_SCRIPT } from "@/lib/dpp/embedded-payment";
import PayPanel from "./PayPanel";

export const dynamic = "force-dynamic";

function Notice({ title, body }: { title: string; body: string }) {
  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f4f7",
        display: "flex",
        justifyContent: "center",
        alignItems: "flex-start",
        padding: "64px 16px",
        fontFamily:
          "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
      }}
    >
      <div
        style={{
          maxWidth: 520,
          background: "#fff",
          borderRadius: 12,
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          padding: "32px 28px",
          textAlign: "center",
        }}
      >
        <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>{title}</div>
        <p style={{ color: "#555", marginTop: 10 }}>{body}</p>
      </div>
    </div>
  );
}

export default async function PayPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

  const ref = verifyPayToken(token);
  if (!ref) {
    return <Notice title="Invalid link" body="This payment link is invalid or has expired." />;
  }

  const supabase = getSupabaseAdmin();

  const { data: invoice } = await supabase
    .from("tracked_invoices")
    .select("*")
    .eq("id", ref.id)
    .maybeSingle();

  if (!invoice) {
    return <Notice title="Not found" body="We couldn't find this invoice." />;
  }
  if (invoice.status === "paid") {
    return <Notice title="Already paid" body="This invoice has already been paid. Thank you!" />;
  }
  if (invoice.status === "voided") {
    return <Notice title="No longer payable" body="This invoice was cancelled. Please contact the sender." />;
  }

  const amount = Number(invoice.balance_due ?? invoice.amount ?? 0);
  if (!(amount > 0)) {
    return <Notice title="Nothing due" body="There is no balance due on this invoice." />;
  }

  const { data: merchant } = await supabase
    .from("merchants")
    .select("company_name, dpp_merchant_id")
    .eq("id", invoice.merchant_id)
    .maybeSingle();

  const businessName = merchant?.company_name || "Payment";

  // Resilient logo fetch — a not-yet-migrated logo_url column must never break pay.
  let logoUrl: string | null = null;
  const { data: logoRow, error: logoErr } = await supabase
    .from("merchants")
    .select("logo_url")
    .eq("id", invoice.merchant_id)
    .maybeSingle();
  if (!logoErr && (logoRow as any)?.logo_url) logoUrl = (logoRow as any).logo_url as string;

  if (!merchant?.dpp_merchant_id) {
    return <Notice title="Unavailable" body="Online payment isn't set up for this business yet." />;
  }

  const creds = await getMerchantDppCredentialsOrNull(merchant.dpp_merchant_id);
  if (!creds?.signatureKey) {
    return (
      <Notice
        title="Unavailable"
        body="Card payments aren't enabled for this business yet. Please contact the sender."
      />
    );
  }

  let jwt: string;
  try {
    jwt = createEmbeddedPaymentJwt(
      {
        invoiceNumber: invoice.invoice_number,
        amount,
        customerName: invoice.customer_name || undefined,
        customerEmail: invoice.customer_email || undefined,
      },
      creds
    );
  } catch {
    return <Notice title="Unavailable" body="We couldn't start the payment. Please contact the sender." />;
  }

  const isProd = (process.env.DPP_EMBEDDED_ENV || "sandbox").toLowerCase() === "production";
  const scriptUrl = isProd ? DELUXE_EMBEDDED_SCRIPT.production : DELUXE_EMBEDDED_SCRIPT.sandbox;

  return (
    <PayPanel
      jwt={jwt}
      scriptUrl={scriptUrl}
      googlePayEnv={isProd ? "PRODUCTION" : "TEST"}
      businessName={businessName}
      logoUrl={logoUrl}
      amount={amount}
      invoiceNumber={invoice.invoice_number}
    />
  );
}
