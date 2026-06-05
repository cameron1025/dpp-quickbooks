"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ConnectToQuickBooks } from "@/components/quickbooks";

interface StatusData {
  connected: boolean;
  companyName?: string;
  connectedAt?: string;
  connectionHealth: "healthy" | "degraded" | "disconnected";
}

interface OpenInvoice {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  balance_due: number;
  due_date: string | null;
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [status, setStatus] = useState<StatusData>({
    connected: false,
    connectionHealth: "disconnected",
  });
  const [loading, setLoading] = useState(true);
  const [notification, setNotification] = useState<
    { type: "success" | "error" | "info"; message: string } | null
  >(null);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const disconnected = searchParams.get("disconnected");
    if (connected === "true") {
      setNotification({ type: "success", message: "Successfully connected to QuickBooks!" });
    } else if (error) {
      const messages: Record<string, string> = {
        oauth_denied: "QuickBooks authorization was cancelled.",
        state_mismatch: "Security check failed. Please try again.",
        email_not_verified: "Your Intuit email is not verified. Please verify it and try again.",
        oauth_exchange_failed: "Connection failed. Please try again.",
        invalid_callback: "Invalid callback. Please try connecting again.",
      };
      setNotification({ type: "error", message: messages[error] || "Connection error: " + error });
    } else if (disconnected === "appstore") {
      setNotification({
        type: "info",
        message: "Your app was disconnected from the QuickBooks App Store. You can reconnect below.",
      });
    }
    if (connected || error || disconnected) {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  const [openInvoices, setOpenInvoices] = useState<OpenInvoice[]>([]);
  const [selectedInvoice, setSelectedInvoice] = useState("");
  const [payLink, setPayLink] = useState("");
  const [genLoading, setGenLoading] = useState(false);
  const [payErr, setPayErr] = useState("");
  const [payCopied, setPayCopied] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/status");
      if (res.ok) setStatus(await res.json());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Load open invoices for the "Take a payment" flow once connected.
  useEffect(() => {
    if (!status.connected) return;
    fetch("/api/merchant/open-invoices")
      .then((r) => (r.ok ? r.json() : { invoices: [] }))
      .then((d) => setOpenInvoices(d.invoices || []))
      .catch(() => {});
  }, [status.connected]);

  const generatePayLink = async () => {
    if (!selectedInvoice) return;
    setGenLoading(true);
    setPayErr("");
    setPayLink("");
    setPayCopied(false);
    try {
      const res = await fetch("/api/merchant/payment-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ invoiceId: selectedInvoice }),
      });
      const data = await res.json();
      if (res.ok) setPayLink(data.url);
      else setPayErr(data.error || "Failed to generate payment link");
    } finally {
      setGenLoading(false);
    }
  };

  const handleDisconnect = async () => {
    const res = await fetch("/api/quickbooks/disconnect", { method: "POST" });
    if (res.ok) {
      setStatus((p) => ({ ...p, connected: false, connectionHealth: "disconnected" }));
      setNotification({ type: "info", message: "Disconnected from QuickBooks. You can reconnect anytime." });
    } else {
      setNotification({ type: "error", message: "Failed to disconnect. Please try again." });
    }
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f4f4f7", fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif' }}>
      {/* Header */}
      <header style={{ background: "#fff", borderBottom: "1px solid #e5e7eb" }}>
        <div style={{ maxWidth: "640px", margin: "0 auto", padding: "0 20px", height: "60px", display: "flex", alignItems: "center", gap: "10px" }}>
          <img src="/logo.png" alt="PaySync" style={{ width: "28px", height: "28px", borderRadius: "6px" }} />
          <span style={{ fontWeight: 600, fontSize: "16px", color: "#111" }}>PaySync</span>
        </div>
      </header>

      {notification && (
        <div
          style={{
            padding: "12px 20px",
            fontSize: "14px",
            fontWeight: 500,
            textAlign: "center",
            color: notification.type === "success" ? "#166534" : notification.type === "error" ? "#991B1B" : "#1E40AF",
            background: notification.type === "success" ? "#DCFCE7" : notification.type === "error" ? "#FEE2E2" : "#DBEAFE",
          }}
        >
          {notification.message}
        </div>
      )}

      <main style={{ maxWidth: "640px", margin: "0 auto", padding: "48px 20px" }}>
        {loading ? (
          <p style={{ textAlign: "center", color: "#9ca3af" }}>Loading…</p>
        ) : status.connected ? (
          <>
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              padding: "40px 32px",
              textAlign: "center",
            }}
          >
            <div
              style={{
                width: "56px",
                height: "56px",
                borderRadius: "50%",
                background: "#DCFCE7",
                color: "#16a34a",
                fontSize: "30px",
                lineHeight: "56px",
                margin: "0 auto 16px",
              }}
            >
              ✓
            </div>
            <h1 style={{ fontSize: "22px", color: "#111", margin: "0 0 8px" }}>You're all set</h1>
            <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, margin: "0 0 4px" }}>
              {status.companyName ? <>PaySync is connected to your QuickBooks (<b>{status.companyName}</b>).</> : "PaySync is connected to your QuickBooks."}
            </p>
            <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, margin: "0 0 24px" }}>
              Your payments now sync to QuickBooks <b>automatically</b> — there's nothing else you need to do.
            </p>
            {status.connectionHealth === "degraded" && (
              <p style={{ fontSize: "13px", color: "#92400E", background: "#FEF3C7", padding: "8px 12px", borderRadius: "8px", marginBottom: "20px" }}>
                We're having trouble reaching QuickBooks right now. Syncing will resume automatically once the connection recovers.
              </p>
            )}

            {/* One-time QuickBooks setup so emails come only from PaySync */}
            <div
              style={{
                textAlign: "left",
                background: "#f8fafc",
                border: "1px solid #e5e7eb",
                borderRadius: "10px",
                padding: "16px 18px",
                marginBottom: "24px",
              }}
            >
              <p style={{ fontSize: "13px", fontWeight: 600, color: "#111", margin: "0 0 8px" }}>
                Two one-time steps in QuickBooks
              </p>
              <ol style={{ margin: 0, paddingLeft: "18px", color: "#555", fontSize: "13px", lineHeight: 1.6 }}>
                <li>
                  When saving an invoice, choose <b>“Save and close”</b> once — QuickBooks
                  remembers it, so invoices aren't auto-emailed.
                </li>
                <li>
                  Turn off QuickBooks' <b>automatic invoice reminders</b> (Settings → Sales →
                  Reminders).
                </li>
              </ol>
              <p style={{ fontSize: "12px", color: "#9ca3af", margin: "8px 0 0" }}>
                We handle the invoice email and reminders — each with your secure pay link.
              </p>
            </div>

            <button
              onClick={handleDisconnect}
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                color: "#991B1B",
                background: "#fff",
                border: "1px solid #FCA5A5",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Disconnect QuickBooks
            </button>
            <p style={{ fontSize: "12px", color: "#9ca3af", marginTop: "20px" }}>
              <a href="/learn-more" style={{ color: "#2563EB", textDecoration: "none" }}>
                How this integration works
              </a>
            </p>
          </div>

          {/* Take a payment (manual / phone / in-person) */}
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              padding: "28px 32px",
              marginTop: "20px",
              textAlign: "left",
            }}
          >
            <h2 style={{ fontSize: "17px", color: "#111", margin: "0 0 6px" }}>Take a payment</h2>
            <p style={{ fontSize: "14px", color: "#555", lineHeight: 1.5, margin: "0 0 16px" }}>
              Charging a customer by phone or in person? Pick an open invoice to get a
              secure payment link, then open it to enter their card or bank details. The
              payment posts to QuickBooks automatically.
            </p>
            {openInvoices.length === 0 ? (
              <p style={{ fontSize: "14px", color: "#9ca3af" }}>No open invoices right now.</p>
            ) : (
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <select
                  value={selectedInvoice}
                  onChange={(e) => {
                    setSelectedInvoice(e.target.value);
                    setPayLink("");
                    setPayErr("");
                  }}
                  style={{ flex: "1 1 280px", padding: "10px 12px", fontSize: "14px", border: "1px solid #d0d0d7", borderRadius: "8px", background: "#fff" }}
                >
                  <option value="">Select an open invoice…</option>
                  {openInvoices.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      #{inv.invoice_number} — {inv.customer_name || "Customer"} — $
                      {Number(inv.balance_due).toLocaleString("en-US", { minimumFractionDigits: 2 })}
                    </option>
                  ))}
                </select>
                <button
                  onClick={generatePayLink}
                  disabled={!selectedInvoice || genLoading}
                  style={{
                    padding: "10px 18px",
                    fontSize: "14px",
                    fontWeight: 600,
                    color: "#fff",
                    background: !selectedInvoice || genLoading ? "#9CA3AF" : "#2CA01C",
                    border: "none",
                    borderRadius: "8px",
                    cursor: !selectedInvoice || genLoading ? "default" : "pointer",
                  }}
                >
                  {genLoading ? "Generating…" : "Generate payment link"}
                </button>
              </div>
            )}
            {payErr && <p style={{ color: "#DC2626", fontSize: "13px", marginTop: "10px" }}>{payErr}</p>}
            {payLink && (
              <div style={{ marginTop: "14px", display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                <code style={{ flex: "1 1 320px", background: "#f6f8fa", padding: "10px 12px", borderRadius: "8px", fontSize: "12px", wordBreak: "break-all" }}>
                  {payLink}
                </code>
                <a
                  href={payLink}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ padding: "10px 16px", fontSize: "13px", fontWeight: 600, color: "#fff", background: "#2563EB", borderRadius: "8px", textDecoration: "none" }}
                >
                  Open
                </a>
                <button
                  onClick={() => {
                    navigator.clipboard?.writeText(payLink);
                    setPayCopied(true);
                  }}
                  style={{ padding: "10px 16px", fontSize: "13px", border: "1px solid #d0d0d7", background: "#fff", borderRadius: "8px", cursor: "pointer" }}
                >
                  {payCopied ? "Copied" : "Copy"}
                </button>
              </div>
            )}
          </div>
          </>
        ) : (
          <div
            style={{
              background: "#fff",
              borderRadius: "14px",
              boxShadow: "0 2px 12px rgba(0,0,0,0.07)",
              padding: "40px 32px",
              textAlign: "center",
            }}
          >
            <h1 style={{ fontSize: "22px", color: "#111", margin: "0 0 8px" }}>Connect your QuickBooks</h1>
            <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, margin: "0 0 24px" }}>
              Link your QuickBooks Online account to start syncing your payments automatically.
            </p>
            <div style={{ display: "flex", justifyContent: "center" }}>
              <ConnectToQuickBooks />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", color: "#9ca3af" }}>
          Loading…
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
