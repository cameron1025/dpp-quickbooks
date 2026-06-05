"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { AdminHeader } from "@/components/AdminHeader";

interface SyncLogEntry {
  id: string;
  created_at: string;
  direction: string;
  entity_type: string;
  entity_id: string;
  qb_entity_id: string | null;
  status: string;
  error_message: string | null;
}

interface Details {
  merchant: {
    id: string;
    company_name: string;
    email: string;
    dpp_merchant_id: string | null;
    qb_realm_id: string | null;
    qb_connected: boolean;
    qb_connected_at: string | null;
    status: string;
    dpp_subscribed_at: string | null;
  };
  subscribed: boolean;
  connectionHealth: "healthy" | "degraded" | "disconnected";
  settings: Record<string, unknown>;
  reminderSettings: Record<string, unknown>;
  transactions: SyncLogEntry[];
  stats: {
    paymentsToday: number;
    revenueToday: number;
    syncedInvoices: number;
    pendingSync: number;
  };
}

const card: React.CSSProperties = {
  background: "#fff",
  borderRadius: "12px",
  boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
  padding: "20px 24px",
  marginBottom: "20px",
};
const cell: React.CSSProperties = {
  padding: "10px 12px",
  borderBottom: "1px solid #eee",
  fontSize: "13px",
  textAlign: "left",
  verticalAlign: "middle",
};

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span
      style={{
        display: "inline-block",
        padding: "2px 10px",
        borderRadius: "999px",
        fontSize: "12px",
        fontWeight: 600,
        color: ok ? "#166534" : "#991B1B",
        background: ok ? "#DCFCE7" : "#FEE2E2",
      }}
    >
      {label}
    </span>
  );
}

function statusColor(status: string): React.CSSProperties {
  const map: Record<string, [string, string]> = {
    success: ["#166534", "#DCFCE7"],
    synced: ["#166534", "#DCFCE7"],
    pending: ["#92400E", "#FEF3C7"],
    failed: ["#991B1B", "#FEE2E2"],
    failed_retrying: ["#92400E", "#FEF3C7"],
    failed_permanent: ["#991B1B", "#FEE2E2"],
    skipped: ["#374151", "#F3F4F6"],
  };
  const [color, background] = map[status] || ["#374151", "#F3F4F6"];
  return { color, background };
}

export default function AdminMerchantDetail() {
  const params = useParams();
  const id = Array.isArray(params.id) ? params.id[0] : params.id;
  const [data, setData] = useState<Details | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    const res = await fetch(`/api/admin/merchants/${id}/details`);
    if (res.status === 401) {
      window.location.href = "/admin/login";
      return;
    }
    if (res.status === 404) {
      setNotFound(true);
      setLoading(false);
      return;
    }
    setData(await res.json());
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (action: "subscribe" | "disconnect") => {
    setBusy(action);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/merchants/${id}/${action}`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      setNotice(
        res.ok
          ? action === "subscribe"
            ? "Webhooks re-subscribed."
            : "Disconnected from QuickBooks."
          : `Failed: ${body.error || res.status}`
      );
      await load();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div
      style={{
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        background: "#f4f4f7",
        minHeight: "100vh",
        padding: "32px 20px",
      }}
    >
      <div style={{ maxWidth: "1000px", margin: "0 auto" }}>
        <AdminHeader
          right={
            <a href="/admin" style={{ fontSize: "13px", color: "#2563EB", textDecoration: "none" }}>
              ← Back to all merchants
            </a>
          }
        />

        {loading ? (
          <p style={{ fontSize: "14px", color: "#888", marginTop: "20px" }}>Loading…</p>
        ) : notFound || !data ? (
          <p style={{ fontSize: "14px", color: "#888", marginTop: "20px" }}>Merchant not found.</p>
        ) : (
          <>
            <h1 style={{ fontSize: "22px", margin: "12px 0 4px", color: "#1a1a1a" }}>
              {data.merchant.company_name || "—"}
            </h1>
            <p style={{ fontSize: "13px", color: "#888", margin: "0 0 20px" }}>
              {data.merchant.email}
              {data.merchant.dpp_merchant_id ? ` · MID ${data.merchant.dpp_merchant_id}` : ""}
            </p>

            {notice && (
              <p style={{ fontSize: "13px", color: "#166534", marginBottom: "12px" }}>{notice}</p>
            )}

            {/* Status + actions */}
            <div style={card}>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", marginBottom: "16px" }}>
                <Pill ok={data.merchant.qb_connected} label={data.merchant.qb_connected ? "QuickBooks connected" : "Not connected"} />
                <Pill ok={data.connectionHealth === "healthy"} label={`Health: ${data.connectionHealth}`} />
                <Pill ok={data.subscribed} label={data.subscribed ? "Webhooks subscribed" : "Not subscribed"} />
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                {data.merchant.dpp_merchant_id && (
                  <button
                    onClick={() => act("subscribe")}
                    disabled={busy !== null}
                    style={{
                      padding: "8px 14px",
                      fontSize: "13px",
                      border: "1px solid #d0d0d7",
                      background: "#fff",
                      borderRadius: "8px",
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    {busy === "subscribe" ? "…" : "Re-subscribe webhooks"}
                  </button>
                )}
                {data.merchant.qb_connected && (
                  <button
                    onClick={() => {
                      if (confirm("Disconnect this client's QuickBooks? They'll need to reconnect to resume syncing.")) {
                        act("disconnect");
                      }
                    }}
                    disabled={busy !== null}
                    style={{
                      padding: "8px 14px",
                      fontSize: "13px",
                      border: "1px solid #FCA5A5",
                      color: "#991B1B",
                      background: "#fff",
                      borderRadius: "8px",
                      cursor: busy ? "default" : "pointer",
                    }}
                  >
                    {busy === "disconnect" ? "…" : "Disconnect QuickBooks"}
                  </button>
                )}
              </div>
              {data.merchant.qb_connected_at && (
                <p style={{ fontSize: "12px", color: "#888", marginTop: "12px" }}>
                  Connected {new Date(data.merchant.qb_connected_at).toLocaleString()}
                </p>
              )}
            </div>

            {/* Stats */}
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
                gap: "12px",
                marginBottom: "20px",
              }}
            >
              {[
                { label: "Payments today", value: data.stats.paymentsToday.toLocaleString() },
                {
                  label: "Revenue today",
                  value: `$${data.stats.revenueToday.toLocaleString("en-US", { minimumFractionDigits: 2 })}`,
                },
                { label: "Synced invoices", value: data.stats.syncedInvoices.toLocaleString() },
                { label: "Pending sync", value: data.stats.pendingSync.toLocaleString() },
              ].map((s) => (
                <div key={s.label} style={{ ...card, marginBottom: 0, padding: "16px" }}>
                  <p style={{ fontSize: "11px", color: "#888", textTransform: "uppercase", margin: 0 }}>
                    {s.label}
                  </p>
                  <p style={{ fontSize: "22px", fontWeight: 600, margin: "4px 0 0", color: "#111" }}>
                    {s.value}
                  </p>
                </div>
              ))}
            </div>

            {/* Settings summary */}
            <div style={card}>
              <h2 style={{ fontSize: "15px", margin: "0 0 10px" }}>Settings</h2>
              <p style={{ fontSize: "13px", color: "#444", margin: "0 0 4px" }}>
                Auto-sync: <b>{String((data.settings as any).auto_sync_payments ?? "—")}</b> ·
                Frequency: <b>{String((data.settings as any).sync_frequency ?? "—")}</b>
              </p>
              <p style={{ fontSize: "13px", color: "#444", margin: 0 }}>
                Reminders enabled: <b>{String((data.reminderSettings as any).reminders_enabled ?? "—")}</b>
              </p>
            </div>

            {/* Sync history */}
            <div style={card}>
              <h2 style={{ fontSize: "15px", margin: "0 0 10px" }}>Sync history</h2>
              {data.transactions.length === 0 ? (
                <p style={{ fontSize: "13px", color: "#888" }}>
                  No transactions synced yet. Payments appear here once processed through Deluxe.
                </p>
              ) : (
                <div style={{ overflowX: "auto" }}>
                  <table style={{ width: "100%", borderCollapse: "collapse" }}>
                    <thead>
                      <tr>
                        <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Type</th>
                        <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Entity</th>
                        <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Status</th>
                        <th style={{ ...cell, color: "#666", fontWeight: 600 }}>When</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.transactions.map((t) => (
                        <tr key={t.id}>
                          <td style={cell}>
                            {t.entity_type}{" "}
                            <span style={{ color: "#aaa", fontSize: "11px" }}>
                              {t.direction === "dpp_to_qb" ? "→ QB" : "← QB"}
                            </span>
                          </td>
                          <td style={{ ...cell, fontFamily: "monospace", fontSize: "12px" }}>
                            {t.entity_id?.length > 18 ? t.entity_id.slice(0, 18) + "…" : t.entity_id}
                            {t.qb_entity_id ? ` · QB#${t.qb_entity_id}` : ""}
                            {t.error_message && (
                              <div style={{ color: "#DC2626", fontSize: "11px" }}>{t.error_message}</div>
                            )}
                          </td>
                          <td style={cell}>
                            <span
                              style={{
                                ...statusColor(t.status),
                                padding: "2px 8px",
                                borderRadius: "999px",
                                fontSize: "11px",
                                fontWeight: 600,
                              }}
                            >
                              {t.status}
                            </span>
                          </td>
                          <td style={{ ...cell, whiteSpace: "nowrap", color: "#666" }}>
                            {new Date(t.created_at).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
