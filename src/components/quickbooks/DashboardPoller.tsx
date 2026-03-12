"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";

interface DashboardData {
  stats: {
    totalSynced: number;
    totalFailed: number;
    totalPending: number;
    lastSyncAt: string | null;
  };
  recentTransactions: Array<{
    id: string;
    transaction_id: string;
    status: string;
    amount: number;
    created_at: string;
    retry_count: number;
  }>;
  connectionStatus: {
    connected: boolean;
    companyName: string | null;
  };
}

interface DashboardPollerProps {
  isPolling: boolean;
  isLoading: boolean;
  lastUpdated: Date | null;
  onRefresh: () => void;
  onTogglePolling: () => void;
}

const DEFAULT_POLL_INTERVAL_MS = 30_000;
const MIN_POLL_INTERVAL_MS = 10_000;
const MAX_POLL_INTERVAL_MS = 120_000;

export function useDashboardPolling(intervalMs = DEFAULT_POLL_INTERVAL_MS) {
  const [data, setData] = useState<DashboardData | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isPolling, setIsPolling] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const mountedRef = useRef(true);

  const safeInterval = Math.max(
    MIN_POLL_INTERVAL_MS,
    Math.min(intervalMs, MAX_POLL_INTERVAL_MS)
  );

  const fetchDashboard = useCallback(async () => {
    if (!mountedRef.current) return;
    setIsLoading(true);
    setError(null);

    try {
      const [statusRes, txRes] = await Promise.all([
        fetch("/api/merchant/status"),
        fetch("/api/merchant/transactions?limit=20"),
      ]);

      if (!statusRes.ok || !txRes.ok) {
        throw new Error("Failed to fetch dashboard data");
      }

      const statusData = await statusRes.json();
      const txData = await txRes.json();

      if (!mountedRef.current) return;

      setData({
        stats: statusData.stats || {
          totalSynced: 0,
          totalFailed: 0,
          totalPending: 0,
          lastSyncAt: null,
        },
        recentTransactions: txData.transactions || [],
        connectionStatus: {
          connected: statusData.connected || false,
          companyName: statusData.companyName || null,
        },
      });
      setLastUpdated(new Date());
    } catch (err) {
      if (!mountedRef.current) return;
      setError(err instanceof Error ? err.message : "Unknown error");
      console.error("[DashboardPoller] Fetch error:", err);
    } finally {
      if (mountedRef.current) {
        setIsLoading(false);
      }
    }
  }, []);

  const refresh = useCallback(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  const togglePolling = useCallback(() => {
    setIsPolling((prev) => !prev);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    fetchDashboard();

    if (isPolling) {
      intervalRef.current = setInterval(fetchDashboard, safeInterval);
    }

    return () => {
      mountedRef.current = false;
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
    };
  }, [isPolling, safeInterval, fetchDashboard]);

  return {
    data,
    isLoading,
    isPolling,
    lastUpdated,
    error,
    refresh,
    togglePolling,
  };
}

export function DashboardPoller({
  isPolling,
  isLoading,
  lastUpdated,
  onRefresh,
  onTogglePolling,
}: DashboardPollerProps) {
  const formatLastUpdated = (date: Date | null): string => {
    if (!date) return "Never";
    const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
    if (seconds < 5) return "Just now";
    if (seconds < 60) return `${seconds}s ago`;
    const minutes = Math.floor(seconds / 60);
    return `${minutes}m ago`;
  };

  const [, setTick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setTick((t) => t + 1), 10_000);
    return () => clearInterval(timer);
  }, []);

  return React.createElement(
    "div",
    {
      style: {
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "12px 16px",
        backgroundColor: "#F9FAFB",
        borderRadius: "8px",
        border: "1px solid #E5E7EB",
        marginBottom: "16px",
        flexWrap: "wrap",
        gap: "8px",
      },
    },
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "12px",
          fontSize: "14px",
          color: "#6B7280",
        },
      },
      React.createElement("div", {
        style: {
          width: "8px",
          height: "8px",
          borderRadius: "50%",
          backgroundColor: isPolling ? "#10B981" : "#9CA3AF",
          flexShrink: 0,
        },
      }),
      React.createElement(
        "span",
        null,
        isPolling ? "Auto-refreshing" : "Auto-refresh paused"
      ),
      React.createElement("span", { style: { color: "#9CA3AF" } }, String.fromCharCode(8226)),
      React.createElement(
        "span",
        null,
        "Updated " + formatLastUpdated(lastUpdated)
      )
    ),
    React.createElement(
      "div",
      {
        style: {
          display: "flex",
          alignItems: "center",
          gap: "8px",
        },
      },
      React.createElement(
        "button",
        {
          onClick: onTogglePolling,
          style: {
            padding: "6px 12px",
            fontSize: "13px",
            borderRadius: "6px",
            border: "1px solid #D1D5DB",
            backgroundColor: "white",
            color: "#374151",
            cursor: "pointer",
          },
        },
        isPolling ? "Pause" : "Resume"
      ),
      React.createElement(
        "button",
        {
          onClick: onRefresh,
          disabled: isLoading,
          style: {
            padding: "6px 12px",
            fontSize: "13px",
            borderRadius: "6px",
            border: "none",
            backgroundColor: isLoading ? "#9CA3AF" : "#2CA01C",
            color: "white",
            cursor: isLoading ? "not-allowed" : "pointer",
            display: "flex",
            alignItems: "center",
            gap: "6px",
          },
        },
        isLoading
          ? React.createElement("span", {
              style: {
                display: "inline-block",
                width: "14px",
                height: "14px",
                border: "2px solid rgba(255,255,255,0.3)",
                borderTopColor: "white",
                borderRadius: "50%",
                animation: "spin 0.6s linear infinite",
              },
            })
          : React.createElement(
              "svg",
              {
                width: "14",
                height: "14",
                viewBox: "0 0 24 24",
                fill: "none",
                stroke: "currentColor",
                strokeWidth: "2",
                strokeLinecap: "round",
                strokeLinejoin: "round",
              },
              React.createElement("path", {
                d: "M23 4v6h-6",
              }),
              React.createElement("path", {
                d: "M1 20v-6h6",
              }),
              React.createElement("path", {
                d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15",
              })
            ),
        isLoading ? "Refreshing..." : "Refresh"
      )
    ),
    React.createElement("style", null, "@keyframes spin { to { transform: rotate(360deg); } }")
  );
}

export default DashboardPoller;
