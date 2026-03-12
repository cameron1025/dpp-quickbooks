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
    stats: {
      paymentsToday: 0,
      revenueToday: 0,
      syncedInvoices: 0,
      pendingSync: 0,
    },
    transactions: [],
  });
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    const disconnected = searchParams.get("disconnected");

    if (connected === "true") {
      setNotification({
        type: "success",
        message: "Successfully connected to QuickBooks!",
      });
    } else if (error) {
      const messages: Record<string, string> = {
        oauth_denied: "QuickBooks authorization was cancelled.",
        state_mismatch: "Security check failed. Please try again.",
        email_not_verified:
          "Your Intuit email is not verified. Please verify it and try again.",
        oauth_exchange_failed: "Connection failed. Please try again.",
        invalid_callback: "Invalid callback. Please try connecting again.",
      };
      setNotification({
        type: "error",
        message: messages[error] || `Connection error: ${error}`,
      });
    } else if (disconnected === "appstore") {
      setNotification({
        type: "info",
        message:
          "Your app was disconnected from the QuickBooks App Store. You can reconnect below.",
      });
    }

    if (connected || error || disconnected) {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  const fetchData = useCallback(async () => {
    try {
      const [statusRes, txnRes] = await Promise.all([
        fetch("/api/merchant/status"),
        fetch("/api/merchant/transactions"),
      ]);

      if (statusRes.ok) {
        const statusData = await statusRes.json();
        setMerchant((prev) => ({ ...prev, ...statusData }));
      }

      if (txnRes.ok) {
        const txnData = await txnRes.json();
        setMerchant((prev) => ({
          ...prev,
          transactions: txnData.transactions || [],
          stats: { ...prev.stats, ...txnData.stats },
        }));
      }
    } catch {
      // Silent fail on load
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const handleDisconnect = async () => {
    const res = await fetch("/api/quickbooks/disconnect", { method: "POST" });

    if (res.ok) {
      setMerchant((prev) => ({
        ...prev,
        connected: false,
        connectionHealth: "disconnected",
      }));
      setNotification({
        type: "info",
        message: "Disconnected from QuickBooks. You can reconnect anytime.",
      });
    } else {
      setNotification({
        type: "error",
        message: "Failed to disconnect. Please try again.",
      });
    }
  };

  const statusColor = {
    pending: "bg-yellow-100 text-yellow-800",
    success: "bg-green-100 text-green-800",
    failed: "bg-red-100 text-red-800",
    skipped: "bg-gray-100 text-gray-600",
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex items-center justify-between h-16">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-dpp-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">D</span>
              </div>
              <span className="font-semibold text-lg text-gray-900">
                DPP Payments
              </span>
            </div>
            <nav className="flex items-center gap-4">
              
                href="/learn-more"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Learn more
              </a>
              
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Settings
              </a>
            </nav>
          </div>
        </div>
      </header>

      {notification && (
        <div
          className={`
            px-4 py-3 text-sm font-medium text-center
            ${
              notification.type === "success"
                ? "bg-green-50 text-green-800 border-b border-green-200"
                : notification.type === "error"
                ? "bg-red-50 text-red-800 border-b border-red-200"
                : "bg-blue-50 text-blue-800 border-b border-blue-200"
            }
          `}
        >
          <div className="max-w-7xl mx-auto flex items-center justify-between">
            <span>{notification.message}</span>
            <button
              onClick={() => setNotification(null)}
              className="ml-4 text-current opacity-60 hover:opacity-100"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {/* Stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                { label: "Payments Today", value: merchant.stats.paymentsToday, format: "number" },
                { label: "Revenue Today", value: merchant.stats.revenueToday, format: "currency" },
                { label: "Synced Invoices", value: merchant.stats.syncedInvoices, format: "number" },
                { label: "Pending Sync", value: merchant.stats.pendingSync, format: "number" },
              ].map((stat) => (
                <div
                  key={stat.label}
                  className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm"
                >
                  <p className="text-xs text-gray-500 uppercase tracking-wide">
                    {stat.label}
                  </p>
                  <p className="mt-1 text-2xl font-semibold text-gray-900">
                    {stat.format === "currency"
                      ? `$${stat.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}`
                      : stat.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Transaction History */}
            <div className="bg-white rounded-xl border border-gray-200 shadow-sm">
              <div className="px-6 py-4 border-b border-gray-100">
                <h2 className="font-semibold text-gray-900">Sync History</h2>
              </div>

              {merchant.transactions.length > 0 ? (
                <div className="divide-y divide-gray-100">
                  {merchant.transactions.map((txn) => (
                    <div
                      key={txn.id}
                      className="px-6 py-4 flex items-center justify-between"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="text-sm font-medium text-gray-900">
                            {txn.entity_type}
                          </span>
                          <span className="text-xs text-gray-400">
                            {txn.direction === "dpp_to_qb" ? "→ QuickBooks" : "← QuickBooks"}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 mt-1">
                          <span className="text-xs text-gray-500 font-mono">
                            {txn.entity_id.length > 20
                              ? txn.entity_id.substring(0, 20) + "…"
                              : txn.entity_id}
                          </span>
                          {txn.qb_entity_id && (
                            <span className="text-xs text-gray-400">
                              QB #{txn.qb_entity_id}
                            </span>
                          )}
                        </div>
                        {txn.error_message && (
                          <p className="text-xs text-red-600 mt-1">
                            {txn.error_message}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-4">
                        <span
                          className={`
                            text-xs font-medium px-2 py-1 rounded-full
                            ${statusColor[txn.status]}
                          `}
                        >
                          {txn.status}
                        </span>
                        <span className="text-xs text-gray-400 whitespace-nowrap">
                          {new Date(txn.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="px-6 py-12 text-center">
                  <p className="text-sm text-gray-500">
                    {merchant.connected
                      ? "No transactions synced yet. Payments will appear here once processed through DPP."
                      : "Connect to QuickBooks to start syncing transactions."}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Right Column */}
          <div className="space-y-6">
            <ConnectionStatus
              connected={merchant.connected}
              companyName={merchant.companyName}
              connectedAt={merchant.connectedAt}
              connectionHealth={merchant.connectionHealth}
              lastSyncAt={merchant.lastSyncAt}
              onDisconnect={handleDisconnect}
            />

            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">Resources</h3>
              <ul className="space-y-2">
                <li>
                  <a href="/learn-more" className="text-sm text-dpp-accent hover:underline">
                    How this integration works
                  </a>
                </li>
                <li>
                  
                    href="https://quickbooks.intuit.com/app/apps/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-dpp-accent hover:underline"
                  >
                    QuickBooks App Store
                  </a>
                </li>
                <li>
                  
                    href="mailto:support@dpp-payments.example.com"
                    className="text-sm text-dpp-accent hover:underline"
                  >
                    Contact support
                  </a>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="animate-pulse text-gray-400">Loading…</div>
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}