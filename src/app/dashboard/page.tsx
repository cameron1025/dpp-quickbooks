"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConnectionStatus } from "@/components/quickbooks";

interface SyncLogEntry {
  id: string;
  created_at: string;
  direction: string;
  entity_type: string;
  entity_id: string;
  qb_entity_id: string | null;
  status: "pending" | "success" | "failed" | "skipped";
  error_message: string | null;
  metadata: Record<string, unknown> | null;
}

interface MerchantData {
  connected: boolean;
  companyName?: string;
  connectedAt?: string;
  connectionHealth: "healthy" | "degraded" | "disconnected";
  lastSyncAt?: string;
  stats: {
    paymentsToday: number;
    revenueToday: number;
    syncedInvoices: number;
    pendingSync: number;
  };
  transactions: SyncLogEntry[];
}

function DashboardContent() {
  const searchParams = useSearchParams();
  const [merchant, setMerchant] = useState<MerchantData>({
    connected: false,
    connectionHealth: "disconnected",
    stats: { paymentsToday: 0, revenueToday: 0, syncedInvoices: 0, pendingSync: 0 },
    transactions: [],
  });
  const [notification, setNotification] = useState<{ type: "success" | "error" | "info"; message: string } | null>(null);

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
      setNotification({ type: "info", message: "Your app was disconnected from the QuickBooks App Store. You can reconnect below." });
    }
    if (connected || error || disconnected) {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, txnRes] = await Promise.all([fetch("/api/merchant/status"), fetch("/api/merchant/transactions")]);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setMerchant(function(prev) { return Object.assign({}, prev, statusData); });
      }
      if (txnRes.ok) {
        const txnData = await txnRes.json();
        setMerchant(function(prev) { return Object.assign({}, prev, { transactions: txnData.transactions || [], stats: Object.assign({}, prev.stats, txnData.stats) }); });
      }
    } catch (_e) { /* silent */ }
  }, []);

  useEffect(() => { fetchData(); }, [fetchData]);

  const handleDisconnect = async () => {
    const res = await fetch("/api/quickbooks/disconnect", { method: "POST" });
    if (res.ok) {
      setMerchant(function(prev) { return Object.assign({}, prev, { connected: false, connectionHealth: "disconnected" }); });
      setNotification({ type: "info", message: "Disconnected from QuickBooks. You can reconnect anytime." });
    } else {
      setNotification({ type: "error", message: "Failed to disconnect. Please try again." });
    }
  };

  const getStatusColor = function(status: string): string {
    if (status === "pending") return "bg-yellow-100 text-yellow-800";
    if (status === "success") return "bg-green-100 text-green-800";
    if (status === "failed") return "bg-red-100 text-red-800";
    return "bg-gray-100 text-gray-600";
  };

  return React.createElement("div", { className: "min-h-screen bg-gray-50" },
    React.createElement("header", { className: "bg-white border-b border-gray-200" },
      React.createElement("div", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8" },
        React.createElement("div", { className: "flex items-center justify-between h-16" },
          React.createElement("div", { className: "flex items-center gap-3" },
            React.createElement("div", { className: "w-8 h-8 bg-dpp-primary rounded-lg flex items-center justify-center" },
              React.createElement("span", { className: "text-white font-bold text-sm" }, "D")
            ),
            React.createElement("span", { className: "font-semibold text-lg text-gray-900" }, "DPP Payments")
          ),
          React.createElement("nav", { className: "flex items-center gap-4" },
            React.createElement("a", { href: "/learn-more", className: "text-sm text-gray-600 hover:text-gray-900 transition-colors" }, "Learn more"),
            React.createElement("a", { href: "/settings", className: "text-sm text-gray-600 hover:text-gray-900 transition-colors" }, "Settings")
          )
        )
      )
    ),
    notification && React.createElement("div", { className: "px-4 py-3 text-sm font-medium text-center " + (notification.type === "success" ? "bg-green-50 text-green-800 border-b border-green-200" : notification.type === "error" ? "bg-red-50 text-red-800 border-b border-red-200" : "bg-blue-50 text-blue-800 border-b border-blue-200") },
      React.createElement("div", { className: "max-w-7xl mx-auto flex items-center justify-between" },
        React.createElement("span", null, notification.message),
        React.createElement("button", { onClick: function() { setNotification(null); }, className: "ml-4 text-current opacity-60 hover:opacity-100" }, "\u2715")
      )
    ),
    React.createElement("main", { className: "max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8" },
      React.createElement("div", { className: "grid grid-cols-1 lg:grid-cols-3 gap-6" },
        React.createElement("div", { className: "lg:col-span-2 space-y-6" },
          React.createElement("div", { className: "grid grid-cols-2 sm:grid-cols-4 gap-4" },
            [
              { label: "Payments Today", value: merchant.stats.paymentsToday, isCurrency: false },
              { label: "Revenue Today", value: merchant.stats.revenueToday, isCurrency: true },
              { label: "Synced Invoices", value: merchant.stats.syncedInvoices, isCurrency: false },
              { label: "Pending Sync", value: merchant.stats.pendingSync, isCurrency: false },
            ].map(function(stat) {
              return React.createElement("div", { key: stat.label, className: "bg-white rounded-xl border border-gray-200 p-4 shadow-sm" },
                React.createElement("p", { className: "text-xs text-gray-500 uppercase tracking-wide" }, stat.label),
                React.createElement("p", { className: "mt-1 text-2xl font-semibold text-gray-900" }, stat.isCurrency ? "$" + stat.value.toLocaleString("en-US", { minimumFractionDigits: 2 }) : stat.value.toLocaleString())
              );
            })
          ),
          React.createElement("div", { className: "bg-white rounded-xl border border-gray-200 shadow-sm" },
            React.createElement("div", { className: "px-6 py-4 border-b border-gray-100" },
              React.createElement("h2", { className: "font-semibold text-gray-900" }, "Sync History")
            ),
            merchant.transactions.length > 0
              ? React.createElement("div", { className: "divide-y divide-gray-100" },
                  merchant.transactions.map(function(txn: SyncLogEntry) {
                    return React.createElement("div", { key: txn.id, className: "px-6 py-4 flex items-center justify-between" },
                      React.createElement("div", { className: "flex-1 min-w-0" },
                        React.createElement("div", { className: "flex items-center gap-2" },
                          React.createElement("span", { className: "text-sm font-medium text-gray-900" }, txn.entity_type),
                          React.createElement("span", { className: "text-xs text-gray-400" }, txn.direction === "dpp_to_qb" ? "\u2192 QuickBooks" : "\u2190 QuickBooks")
                        ),
                        React.createElement("div", { className: "flex items-center gap-3 mt-1" },
                          React.createElement("span", { className: "text-xs text-gray-500 font-mono" }, txn.entity_id.length > 20 ? txn.entity_id.substring(0, 20) + "\u2026" : txn.entity_id),
                          txn.qb_entity_id && React.createElement("span", { className: "text-xs text-gray-400" }, "QB #" + txn.qb_entity_id)
                        ),
                        txn.error_message && React.createElement("p", { className: "text-xs text-red-600 mt-1" }, txn.error_message)
                      ),
                      React.createElement("div", { className: "flex items-center gap-3 ml-4" },
                        React.createElement("span", { className: "text-xs font-medium px-2 py-1 rounded-full " + getStatusColor(txn.status) }, txn.status),
                        React.createElement("span", { className: "text-xs text-gray-400 whitespace-nowrap" }, new Date(txn.created_at).toLocaleString())
                      )
                    );
                  })
                )
              : React.createElement("div", { className: "px-6 py-12 text-center" },
                  React.createElement("p", { className: "text-sm text-gray-500" }, merchant.connected ? "No transactions synced yet. Payments will appear here once processed through DPP." : "Connect to QuickBooks to start syncing transactions.")
                )
          )
        ),
        React.createElement("div", { className: "space-y-6" },
          React.createElement(ConnectionStatus, {
            connected: merchant.connected,
            companyName: merchant.companyName,
            connectedAt: merchant.connectedAt,
            connectionHealth: merchant.connectionHealth,
            lastSyncAt: merchant.lastSyncAt,
            onDisconnect: handleDisconnect,
          }),
          React.createElement("div", { className: "bg-white rounded-xl border border-gray-200 p-6 shadow-sm" },
            React.createElement("h3", { className: "font-semibold text-gray-900 mb-3" }, "Resources"),
            React.createElement("ul", { className: "space-y-2" },
              React.createElement("li", null, React.createElement("a", { href: "/learn-more", className: "text-sm text-dpp-accent hover:underline" }, "How this integration works")),
              React.createElement("li", null, React.createElement("a", { href: "https://quickbooks.intuit.com/app/apps/home", target: "_blank", rel: "noopener noreferrer", className: "text-sm text-dpp-accent hover:underline" }, "QuickBooks App Store")),
              React.createElement("li", null, React.createElement("a", { href: "mailto:support@dpp-payments.example.com", className: "text-sm text-dpp-accent hover:underline" }, "Contact support"))
            )
          )
        )
      )
    )
  );
}

export default function DashboardPage() {
  return React.createElement(Suspense, {
    fallback: React.createElement("div", { className: "min-h-screen bg-gray-50 flex items-center justify-center" },
      React.createElement("div", { className: "animate-pulse text-gray-400" }, "Loading\u2026")
    )
  }, React.createElement(DashboardContent, null));
}