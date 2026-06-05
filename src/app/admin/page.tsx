"use client";

import { useCallback, useEffect, useState } from "react";

interface MerchantRow {
  id: string;
  company_name: string;
  email: string;
  dpp_merchant_id: string | null;
  qb_connected: boolean;
  subscribed: boolean;
  status: string;
  last_sync: { status: string; created_at: string } | null;
}

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

export default function AdminDashboard() {
  const [merchants, setMerchants] = useState<MerchantRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [mid, setMid] = useState("");
  const [link, setLink] = useState("");
  const [linkErr, setLinkErr] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/admin/merchants");
      if (res.status === 401) {
        window.location.href = "/admin/login";
        return;
      }
      const data = await res.json();
      setMerchants(data.merchants || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const generate = async (e: React.FormEvent) => {
    e.preventDefault();
    setLink("");
    setLinkErr("");
    const res = await fetch(`/api/admin/onboard-link?mid=${encodeURIComponent(mid.trim())}`);
    const data = await res.json();
    if (res.ok) setLink(data.url);
    else setLinkErr(data.error || "Failed to generate link");
  };

  const resubscribe = async (id: string) => {
    setBusyId(id);
    setNotice("");
    try {
      const res = await fetch(`/api/admin/merchants/${id}/subscribe`, { method: "POST" });
      const data = await res.json();
      setNotice(res.ok ? "Re-subscribed successfully." : `Failed: ${data.error}`);
      await load();
    } finally {
      setBusyId(null);
    }
  };

  const logout = async () => {
    await fetch("/api/admin/login", { method: "DELETE" });
    window.location.href = "/admin/login";
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
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "24px",
          }}
        >
          <h1 style={{ fontSize: "22px", margin: 0, color: "#1a1a1a" }}>Merchant Admin</h1>
          <button
            onClick={logout}
            style={{
              padding: "8px 14px",
              fontSize: "13px",
              border: "1px solid #d0d0d7",
              background: "#fff",
              borderRadius: "8px",
              cursor: "pointer",
            }}
          >
            Sign out
          </button>
        </div>

        {/* Generate onboarding link */}
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            padding: "20px 24px",
            marginBottom: "24px",
          }}
        >
          <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Onboard a new client</h2>
          <form onSubmit={generate} style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
            <input
              value={mid}
              onChange={(e) => setMid(e.target.value)}
              placeholder="Client's Deluxe MID"
              style={{
                flex: "1 1 240px",
                padding: "10px 12px",
                fontSize: "14px",
                border: "1px solid #d0d0d7",
                borderRadius: "8px",
              }}
            />
            <button
              type="submit"
              style={{
                padding: "10px 18px",
                fontSize: "14px",
                fontWeight: 600,
                color: "#fff",
                background: "#2563EB",
                border: "none",
                borderRadius: "8px",
                cursor: "pointer",
              }}
            >
              Generate link
            </button>
          </form>
          {linkErr && (
            <p style={{ color: "#DC2626", fontSize: "13px", marginTop: "10px" }}>{linkErr}</p>
          )}
          {link && (
            <div
              style={{
                marginTop: "14px",
                display: "flex",
                gap: "8px",
                alignItems: "center",
                flexWrap: "wrap",
              }}
            >
              <code
                style={{
                  flex: "1 1 400px",
                  background: "#f6f8fa",
                  padding: "10px 12px",
                  borderRadius: "8px",
                  fontSize: "12px",
                  wordBreak: "break-all",
                }}
              >
                {link}
              </code>
              <button
                onClick={() => {
                  navigator.clipboard?.writeText(link);
                  setNotice("Link copied.");
                }}
                style={{
                  padding: "10px 16px",
                  fontSize: "13px",
                  border: "1px solid #d0d0d7",
                  background: "#fff",
                  borderRadius: "8px",
                  cursor: "pointer",
                }}
              >
                Copy
              </button>
            </div>
          )}
          <p style={{ fontSize: "12px", color: "#888", marginTop: "12px" }}>
            Send this link to your client. Valid for 7 days. When they connect QuickBooks,
            their MID is linked and webhooks are subscribed automatically.
          </p>
        </div>

        {notice && (
          <p style={{ fontSize: "13px", color: "#166534", marginBottom: "12px" }}>{notice}</p>
        )}

        {/* Merchant health */}
        <div
          style={{
            background: "#fff",
            borderRadius: "12px",
            boxShadow: "0 1px 6px rgba(0,0,0,0.06)",
            padding: "20px 24px",
          }}
        >
          <h2 style={{ fontSize: "16px", margin: "0 0 12px" }}>Merchants</h2>
          {loading ? (
            <p style={{ fontSize: "14px", color: "#888" }}>Loading…</p>
          ) : merchants.length === 0 ? (
            <p style={{ fontSize: "14px", color: "#888" }}>No merchants yet.</p>
          ) : (
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse" }}>
                <thead>
                  <tr>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Merchant</th>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}>MID</th>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}>QuickBooks</th>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Webhooks</th>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}>Last sync</th>
                    <th style={{ ...cell, color: "#666", fontWeight: 600 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {merchants.map((m) => (
                    <tr key={m.id}>
                      <td style={cell}>
                        <a
                          href={`/admin/merchants/${m.id}`}
                          style={{ fontWeight: 600, color: "#2563EB", textDecoration: "none" }}
                        >
                          {m.company_name || "—"}
                        </a>
                        <div style={{ color: "#888", fontSize: "12px" }}>{m.email}</div>
                      </td>
                      <td style={{ ...cell, fontFamily: "monospace", fontSize: "12px" }}>
                        {m.dpp_merchant_id || "—"}
                      </td>
                      <td style={cell}>
                        <Pill ok={m.qb_connected} label={m.qb_connected ? "Connected" : "Not connected"} />
                      </td>
                      <td style={cell}>
                        <Pill ok={m.subscribed} label={m.subscribed ? "Subscribed" : "Not subscribed"} />
                      </td>
                      <td style={cell}>
                        {m.last_sync
                          ? `${m.last_sync.status} · ${new Date(
                              m.last_sync.created_at
                            ).toLocaleString()}`
                          : "—"}
                      </td>
                      <td style={cell}>
                        {m.dpp_merchant_id && (
                          <button
                            onClick={() => resubscribe(m.id)}
                            disabled={busyId === m.id}
                            style={{
                              padding: "6px 12px",
                              fontSize: "12px",
                              border: "1px solid #d0d0d7",
                              background: "#fff",
                              borderRadius: "6px",
                              cursor: busyId === m.id ? "default" : "pointer",
                            }}
                          >
                            {busyId === m.id ? "…" : "Re-subscribe"}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
