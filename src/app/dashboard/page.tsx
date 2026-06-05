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
              {status.companyName ? <>QuickBooks (<b>{status.companyName}</b>) is connected.</> : "QuickBooks is connected."}
            </p>
            <p style={{ fontSize: "15px", color: "#555", lineHeight: 1.6, margin: "0 0 24px" }}>
              Your payments now sync to QuickBooks <b>automatically</b> — there's nothing else you need to do.
            </p>
            {status.connectionHealth === "degraded" && (
              <p style={{ fontSize: "13px", color: "#92400E", background: "#FEF3C7", padding: "8px 12px", borderRadius: "8px", marginBottom: "20px" }}>
                We're having trouble reaching QuickBooks right now. Syncing will resume automatically once the connection recovers.
              </p>
            )}
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
