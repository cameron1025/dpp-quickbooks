// ============================================================
// Dashboard Page — Main merchant interface
// ============================================================

"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ConnectionStatus } from "@/components/quickbooks";

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
  });
  const [notification, setNotification] = useState<{
    type: "success" | "error" | "info";
    message: string;
  } | null>(null);

  // Handle URL params from OAuth callback
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

    // Clean URL params
    if (connected || error || disconnected) {
      window.history.replaceState({}, "", "/dashboard");
    }
  }, [searchParams]);

  // Fetch merchant data
  const fetchMerchantData = useCallback(async () => {
    try {
      const res = await fetch("/api/merchant/status");
      if (res.ok) {
        const data = await res.json();
        setMerchant(data);
      }
    } catch {
      // Silent fail on initial load
    }
  }, []);

  useEffect(() => {
    fetchMerchantData();
  }, [fetchMerchantData]);

  const handleDisconnect = async () => {
    const res = await fetch("/api/quickbooks/disconnect", {
      method: "POST",
    });

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

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Top Bar */}
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
              <a
                href="/learn-more"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Learn more
              </a>
              <a
                href="/settings"
                className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
              >
                Settings
              </a>
            </nav>
          </div>
        </div>
      </header>

      {/* Notification Banner */}
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

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left Column — Connection + Stats */}
          <div className="lg:col-span-2 space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              {[
                {
                  label: "Payments Today",
                  value: merchant.stats.paymentsToday,
                  format: "number",
                },
                {
                  label: "Revenue Today",
                  value: merchant.stats.revenueToday,
                  format: "currency",
                },
                {
                  label: "Synced Invoices",
                  value: merchant.stats.syncedInvoices,
                  format: "number",
                },
                {
                  label: "Pending Sync",
                  value: merchant.stats.pendingSync,
                  format: "number",
                },
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
                      ? `$${stat.value.toLocaleString("en-US", {
                          minimumFractionDigits: 2,
                        })}`
                      : stat.value.toLocaleString()}
                  </p>
                </div>
              ))}
            </div>

            {/* Recent Activity (placeholder) */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h2 className="font-semibold text-gray-900 mb-4">
                Recent Transactions
              </h2>
              {merchant.connected ? (
                <div className="text-sm text-gray-500 text-center py-8">
                  Transactions will appear here once payments are
                  processed through the DPP gateway.
                </div>
              ) : (
                <div className="text-sm text-gray-500 text-center py-8">
                  Connect to QuickBooks to start syncing transactions.
                </div>
              )}
            </div>
          </div>

          {/* Right Column — Connection Card */}
          <div className="space-y-6">
            <ConnectionStatus
              connected={merchant.connected}
              companyName={merchant.companyName}
              connectedAt={merchant.connectedAt}
              connectionHealth={merchant.connectionHealth}
              lastSyncAt={merchant.lastSyncAt}
              onDisconnect={handleDisconnect}
            />

            {/* Quick Links */}
            <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
              <h3 className="font-semibold text-gray-900 mb-3">
                Resources
              </h3>
              <ul className="space-y-2">
                <li>
                  <a
                    href="/learn-more"
                    className="text-sm text-dpp-accent hover:underline"
                  >
                    How this integration works
                  </a>
                </li>
                <li>
                  <a
                    href="https://quickbooks.intuit.com/app/apps/home"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-dpp-accent hover:underline"
                  >
                    QuickBooks App Store
                  </a>
                </li>
                <li>
                  <a
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
