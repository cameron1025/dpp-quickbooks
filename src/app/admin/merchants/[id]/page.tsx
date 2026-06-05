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

interface ReminderForm {
  reminders_enabled: boolean;
  reminder_send_initial: boolean;
  reminder_before_due_days: number;
  reminder_on_due_date: boolean;
  reminder_overdue_3: boolean;
  reminder_overdue_7: boolean;
  reminder_overdue_14: boolean;
  reminder_from_name: string;
  reminder_reply_to: string;
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
    invoice_email_mode: "paysync" | "qb_native";
  };
  subscribed: boolean;
  hasCredentials: boolean;
  credentials: { clientId: string; clientSecret: string; partnerToken: string } | null;
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
const fieldLabel: React.CSSProperties = {
  display: "block",
  fontSize: "12px",
  color: "#6b7280",
  marginBottom: "4px",
};
const fieldInput: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  fontSize: "14px",
  border: "1px solid #d0d0d7",
  borderRadius: "8px",
  boxSizing: "border-box",
};
const eyeButton: React.CSSProperties = {
  padding: "0 14px",
  fontSize: "16px",
  border: "1px solid #d0d0d7",
  background: "#fff",
  borderRadius: "8px",
  cursor: "pointer",
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
  const [midField, setMidField] = useState("");
  const [cId, setCId] = useState("");
  const [cSecret, setCSecret] = useState("");
  const [pToken, setPToken] = useState("");
  const [showSecret, setShowSecret] = useState(false);
  const [showToken, setShowToken] = useState(false);
  const [savingCreds, setSavingCreds] = useState(false);
  const [savingMode, setSavingMode] = useState(false);
  const [rem, setRem] = useState<ReminderForm | null>(null);
  const [savingRem, setSavingRem] = useState(false);

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

  // Prefill the MID + credential fields from the loaded merchant (so saved
  // values stay in the fields rather than disappearing).
  useEffect(() => {
    if (!data) return;
    setMidField(data.merchant.dpp_merchant_id || "");
    if (data.credentials) {
      setCId(data.credentials.clientId || "");
      setCSecret(data.credentials.clientSecret || "");
      setPToken(data.credentials.partnerToken || "");
    }
    const r = data.reminderSettings as Record<string, unknown>;
    setRem({
      reminders_enabled: !!r.reminders_enabled,
      reminder_send_initial: (r.reminder_send_initial as boolean) ?? true,
      reminder_before_due_days: (r.reminder_before_due_days as number) ?? 3,
      reminder_on_due_date: (r.reminder_on_due_date as boolean) ?? true,
      reminder_overdue_3: (r.reminder_overdue_3 as boolean) ?? true,
      reminder_overdue_7: (r.reminder_overdue_7 as boolean) ?? true,
      reminder_overdue_14: (r.reminder_overdue_14 as boolean) ?? true,
      reminder_from_name: (r.reminder_from_name as string) ?? "Billing",
      reminder_reply_to: (r.reminder_reply_to as string) ?? "",
    });
  }, [data]);

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

  const saveReminders = async () => {
    if (!rem) return;
    setSavingRem(true);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/merchants/${id}/reminder-settings`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(rem),
      });
      const body = await res.json().catch(() => ({}));
      setNotice(res.ok ? "Reminder settings saved." : `Failed: ${body.error || res.status}`);
      if (res.ok) await load();
    } finally {
      setSavingRem(false);
    }
  };

  const setInvoiceMode = async (mode: "paysync" | "qb_native") => {
    if (!data || data.merchant.invoice_email_mode === mode) return;
    setSavingMode(true);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/merchants/${id}/invoice-mode`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode }),
      });
      const body = await res.json().catch(() => ({}));
      setNotice(res.ok ? "Invoice email mode updated." : `Failed: ${body.error || res.status}`);
      if (res.ok) await load();
    } finally {
      setSavingMode(false);
    }
  };

  const saveDppConfig = async () => {
    if (!midField.trim()) {
      setNotice("Deluxe MID is required.");
      return;
    }
    setSavingCreds(true);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/merchants/${id}/dpp-config`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mid: midField.trim(),
          clientId: cId.trim(),
          clientSecret: cSecret.trim(),
          partnerToken: pToken.trim(),
        }),
      });
      const body = await res.json().catch(() => ({}));
      setNotice(res.ok ? "Saved." : `Failed: ${body.error || res.status}`);
      // Reload so the fields repopulate from the saved values (they don't clear).
      if (res.ok) await load();
    } finally {
      setSavingCreds(false);
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

            {/* Deluxe MID + credentials */}
            <div style={card}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
                <h2 style={{ fontSize: "15px", margin: 0 }}>Deluxe MID & credentials</h2>
                <Pill ok={data.hasCredentials} label={data.hasCredentials ? "Configured" : "Not configured"} />
              </div>
              <p style={{ fontSize: "12px", color: "#888", margin: "0 0 14px" }}>
                Used for this client's webhook subscriptions and payment links. Stored encrypted.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "12px", maxWidth: "560px" }}>
                <div>
                  <label style={fieldLabel}>Deluxe MID</label>
                  <input value={midField} onChange={(e) => setMidField(e.target.value)} placeholder="Deluxe MID" style={fieldInput} />
                </div>
                <div>
                  <label style={fieldLabel}>Client ID</label>
                  <input value={cId} onChange={(e) => setCId(e.target.value)} placeholder="Client ID" style={fieldInput} />
                </div>
                <div>
                  <label style={fieldLabel}>Client Secret</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type={showSecret ? "text" : "password"}
                      value={cSecret}
                      onChange={(e) => setCSecret(e.target.value)}
                      placeholder="Client Secret"
                      style={{ ...fieldInput, flex: 1 }}
                    />
                    <button type="button" onClick={() => setShowSecret((s) => !s)} aria-label="Toggle client secret visibility" style={eyeButton}>
                      {showSecret ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <div>
                  <label style={fieldLabel}>Partner Token</label>
                  <div style={{ display: "flex", gap: "8px" }}>
                    <input
                      type={showToken ? "text" : "password"}
                      value={pToken}
                      onChange={(e) => setPToken(e.target.value)}
                      placeholder="Partner Token"
                      style={{ ...fieldInput, flex: 1 }}
                    />
                    <button type="button" onClick={() => setShowToken((s) => !s)} aria-label="Toggle partner token visibility" style={eyeButton}>
                      {showToken ? "🙈" : "👁"}
                    </button>
                  </div>
                </div>
                <div>
                  <button
                    onClick={saveDppConfig}
                    disabled={savingCreds}
                    style={{
                      padding: "10px 22px",
                      fontSize: "14px",
                      fontWeight: 600,
                      color: "#fff",
                      background: savingCreds ? "#9CA3AF" : "#16a34a",
                      border: "none",
                      borderRadius: "8px",
                      cursor: savingCreds ? "default" : "pointer",
                    }}
                  >
                    {savingCreds ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            </div>

            {/* Invoice email mode */}
            <div style={card}>
              <h2 style={{ fontSize: "15px", margin: "0 0 4px" }}>Invoice email</h2>
              <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px" }}>
                How the Deluxe pay link reaches the customer when an invoice is created.
              </p>
              <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                {([
                  {
                    value: "paysync" as const,
                    title: "PaySync sends the email",
                    desc: "PaySync sends its own branded email with the pay link (when the merchant didn't send from QuickBooks).",
                  },
                  {
                    value: "qb_native" as const,
                    title: "Embed link in QuickBooks invoice",
                    desc: "PaySync adds the pay link to the invoice message, so it appears in QuickBooks' own email, PDF, and online invoice view. PaySync won't send a separate email. (Best when the merchant emails from QuickBooks. Note: for an immediate “Save and send,” QB may email before the link is added, but it still shows on the invoice/PDF/online view.)",
                  },
                ]).map((opt) => {
                  const active = data.merchant.invoice_email_mode === opt.value;
                  return (
                    <button
                      key={opt.value}
                      onClick={() => setInvoiceMode(opt.value)}
                      disabled={savingMode}
                      style={{
                        textAlign: "left",
                        padding: "12px 14px",
                        borderRadius: "10px",
                        border: active ? "2px solid #2CA01C" : "1px solid #d0d0d7",
                        background: active ? "#F0FDF4" : "#fff",
                        cursor: savingMode ? "default" : "pointer",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
                        <span
                          style={{
                            width: "14px",
                            height: "14px",
                            borderRadius: "50%",
                            border: active ? "4px solid #2CA01C" : "2px solid #9ca3af",
                            display: "inline-block",
                            boxSizing: "border-box",
                          }}
                        />
                        <span style={{ fontSize: "14px", fontWeight: 600, color: "#111" }}>{opt.title}</span>
                      </div>
                      <p style={{ fontSize: "12px", color: "#6b7280", margin: "0 0 0 22px", lineHeight: 1.5 }}>{opt.desc}</p>
                    </button>
                  );
                })}
              </div>
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

            {/* Reminders & invoice email (editable) */}
            {rem && (
              <div style={card}>
                <h2 style={{ fontSize: "15px", margin: "0 0 4px" }}>Reminders & invoice email</h2>
                <p style={{ fontSize: "12px", color: "#888", margin: "0 0 12px" }}>
                  Master switch for PaySync's invoice emails and reminders. If reminders are off,
                  PaySync sends nothing on a new invoice. (Payments always sync regardless.)
                </p>
                <div style={{ display: "flex", flexDirection: "column", gap: "10px", maxWidth: "520px" }}>
                  {[
                    ["reminders_enabled", "Reminders enabled (master switch)"],
                    ["reminder_send_initial", "Send the initial invoice email"],
                    ["reminder_on_due_date", "Remind on the due date"],
                    ["reminder_overdue_3", "Remind 3 days overdue"],
                    ["reminder_overdue_7", "Remind 7 days overdue"],
                    ["reminder_overdue_14", "Remind 14 days overdue"],
                  ].map(([key, label]) => (
                    <label key={key} style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "13px", color: "#444", cursor: "pointer" }}>
                      <input
                        type="checkbox"
                        checked={!!(rem as unknown as Record<string, boolean>)[key]}
                        onChange={(e) => setRem((p) => (p ? { ...p, [key]: e.target.checked } : p))}
                      />
                      {label}
                    </label>
                  ))}
                  <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                    <label style={{ fontSize: "13px", color: "#444" }}>Days before due to remind:</label>
                    <input
                      type="number"
                      min={0}
                      max={30}
                      value={rem.reminder_before_due_days}
                      onChange={(e) => setRem((p) => (p ? { ...p, reminder_before_due_days: Number(e.target.value) } : p))}
                      style={{ ...fieldInput, width: "80px" }}
                    />
                  </div>
                  <div>
                    <label style={fieldLabel}>From name</label>
                    <input value={rem.reminder_from_name} onChange={(e) => setRem((p) => (p ? { ...p, reminder_from_name: e.target.value } : p))} style={fieldInput} />
                  </div>
                  <div>
                    <label style={fieldLabel}>Reply-to email (optional)</label>
                    <input value={rem.reminder_reply_to} onChange={(e) => setRem((p) => (p ? { ...p, reminder_reply_to: e.target.value } : p))} placeholder="" style={fieldInput} />
                  </div>
                  <div>
                    <button
                      onClick={saveReminders}
                      disabled={savingRem}
                      style={{ padding: "10px 22px", fontSize: "14px", fontWeight: 600, color: "#fff", background: savingRem ? "#9CA3AF" : "#16a34a", border: "none", borderRadius: "8px", cursor: savingRem ? "default" : "pointer" }}
                    >
                      {savingRem ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            )}

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
