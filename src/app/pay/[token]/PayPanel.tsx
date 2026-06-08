"use client";

import { useRef, useState } from "react";
import Script from "next/script";

interface PayPanelProps {
  jwt: string;
  scriptUrl: string;
  googlePayEnv: "TEST" | "PRODUCTION";
  businessName: string;
  logoUrl: string | null;
  amount: number;
  invoiceNumber: string;
}

declare global {
  interface Window {
    // deluxe.js injects this global; it has no published types.
    EmbeddedPayments?: any;
  }
}

const money = (n: number) =>
  new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(n);

export default function PayPanel(props: PayPanelProps) {
  const { jwt, scriptUrl, googlePayEnv, businessName, logoUrl, amount, invoiceNumber } = props;
  const [status, setStatus] = useState<"loading" | "ready" | "success" | "failed">("loading");
  const [error, setError] = useState("");
  const initedRef = useRef(false);

  function initSdk() {
    if (initedRef.current) return;
    const EP = window.EmbeddedPayments;
    if (!EP) return; // script not ready yet — onLoad/onReady will call again
    initedRef.current = true;

    EP.init(jwt, {
      countryCode: "US",
      currencyCode: "USD",
      paymentMethods: ["cc", "ach"],
      googlePayEnv,
    })
      .then((instance: any) => {
        instance
          .setEventHandlers({
            onTxnSuccess: (_gateway: string, _data: any) => setStatus("success"),
            onTxnFailed: (_gateway: string, _data: any) => {
              setStatus("failed");
              setError("Your payment could not be processed. Please try again.");
            },
            onValidationError: (_gateway: string, _errors: any) => {
              // Field-level errors render inside the Deluxe panel; nothing to do here.
            },
            onCancel: (_gateway: string) => {
              // Stay on the form so the customer can retry.
            },
          })
          .render({
            containerId: "embeddedpayments",
            paybuttoncolor: "#111827",
            cancelbuttoncolor: "#6b7280",
            paymentpanelstyle: "light",
          });
        setStatus("ready");
      })
      .catch(() => {
        setStatus("failed");
        setError("We couldn't load the secure payment form. Please refresh and try again.");
      });
  }

  return (
    <div style={pageStyle}>
      <Script src={scriptUrl} strategy="afterInteractive" onLoad={initSdk} onReady={initSdk} />

      <div style={cardStyle}>
        <header style={headerStyle}>
          {logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={logoUrl} alt={businessName} style={{ maxHeight: 44, display: "block" }} />
          ) : (
            <span style={{ fontSize: 20, fontWeight: 700 }}>{businessName}</span>
          )}
        </header>

        <div style={summaryStyle}>
          <span style={{ color: "#6b7280", fontSize: 13 }}>Invoice {invoiceNumber}</span>
          <span style={{ fontSize: 28, fontWeight: 700, color: "#111827" }}>{money(amount)}</span>
        </div>

        {status === "success" ? (
          <div style={noticeStyle}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#111827" }}>Payment received</div>
            <p style={{ color: "#555", marginTop: 8 }}>
              Thank you — your payment to {businessName} was successful. A receipt will follow.
            </p>
          </div>
        ) : status === "failed" ? (
          <div style={noticeStyle}>
            <div style={{ fontSize: 18, fontWeight: 700, color: "#b91c1c" }}>Payment failed</div>
            <p style={{ color: "#555", marginTop: 8 }}>{error}</p>
          </div>
        ) : (
          <>
            {status === "loading" && (
              <p style={{ color: "#6b7280", fontSize: 14 }}>Loading secure payment…</p>
            )}
            <div id="embeddedpayments" />
          </>
        )}

        <p style={footerStyle}>Payments are processed securely by Deluxe. Your card details never touch this site.</p>
      </div>
    </div>
  );
}

const pageStyle: React.CSSProperties = {
  minHeight: "100vh",
  background: "#f4f4f7",
  display: "flex",
  justifyContent: "center",
  alignItems: "flex-start",
  padding: "48px 16px",
  fontFamily:
    "-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif",
};
const cardStyle: React.CSSProperties = {
  width: "100%",
  maxWidth: 640,
  background: "#fff",
  borderRadius: 12,
  boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  overflow: "hidden",
  padding: 0,
};
const headerStyle: React.CSSProperties = {
  background: "#111827",
  color: "#fff",
  padding: "20px 28px",
};
const summaryStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  padding: "22px 28px 8px",
};
const noticeStyle: React.CSSProperties = { padding: "8px 28px 28px" };
const footerStyle: React.CSSProperties = {
  color: "#9ca3af",
  fontSize: 12,
  textAlign: "center",
  padding: "8px 28px 24px",
  margin: 0,
};
