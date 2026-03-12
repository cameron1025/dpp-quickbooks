// ============================================================
// QuickBooks Connection Status Card
// ============================================================
// Shows connection state, company info, health indicator,
// and connect/disconnect controls in one place.

"use client";

import React, { useState } from "react";
import { ConnectToQuickBooks, DisconnectFromQuickBooks } from "./ConnectButton";

interface ConnectionStatusProps {
  connected: boolean;
  companyName?: string;
  connectedAt?: string;
  connectionHealth?: "healthy" | "degraded" | "disconnected";
  lastSyncAt?: string;
  onDisconnect: () => Promise<void>;
}

export function ConnectionStatus({
  connected,
  companyName,
  connectedAt,
  connectionHealth = "disconnected",
  lastSyncAt,
  onDisconnect,
}: ConnectionStatusProps) {
  const [disconnecting, setDisconnecting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  const handleDisconnect = async () => {
    setDisconnecting(true);
    try {
      await onDisconnect();
    } finally {
      setDisconnecting(false);
      setShowConfirm(false);
    }
  };

  const healthIndicator = {
    healthy: { color: "bg-green-500", label: "Connected" },
    degraded: { color: "bg-yellow-500", label: "Degraded" },
    disconnected: { color: "bg-gray-400", label: "Disconnected" },
  }[connectionHealth];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          {/* QuickBooks icon (simplified, no trademark issues) */}
          <div className="w-10 h-10 bg-[#2CA01C] rounded-lg flex items-center justify-center">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 15h-2V7h2v10zm4 0h-2V7h2v10z"
                fill="white"
              />
            </svg>
          </div>
          <div>
            <h3 className="font-semibold text-gray-900">
              QuickBooks Online
            </h3>
            <div className="flex items-center gap-2 mt-0.5">
              <span
                className={`inline-block w-2 h-2 rounded-full ${healthIndicator.color}`}
              />
              <span className="text-xs text-gray-500">
                {healthIndicator.label}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Connection Details */}
      {connected && companyName && (
        <div className="mb-4 space-y-2 text-sm">
          <div className="flex justify-between">
            <span className="text-gray-500">Company</span>
            <span className="font-medium text-gray-900">{companyName}</span>
          </div>
          {connectedAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">Connected</span>
              <span className="text-gray-700">
                {new Date(connectedAt).toLocaleDateString()}
              </span>
            </div>
          )}
          {lastSyncAt && (
            <div className="flex justify-between">
              <span className="text-gray-500">Last sync</span>
              <span className="text-gray-700">
                {new Date(lastSyncAt).toLocaleString()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="pt-4 border-t border-gray-100">
        {connected ? (
          <>
            {showConfirm ? (
              <div className="space-y-3">
                <p className="text-sm text-gray-600">
                  Are you sure you want to disconnect? Payment syncing
                  will stop and you&apos;ll need to reconnect to resume.
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleDisconnect}
                    disabled={disconnecting}
                    className="
                      px-4 py-2 text-sm font-medium
                      bg-red-50 text-red-700
                      border border-red-200 rounded-md
                      hover:bg-red-100 transition-colors
                      disabled:opacity-50
                    "
                  >
                    {disconnecting ? "Disconnecting…" : "Yes, disconnect"}
                  </button>
                  <button
                    onClick={() => setShowConfirm(false)}
                    className="
                      px-4 py-2 text-sm font-medium
                      text-gray-600 rounded-md
                      hover:bg-gray-50 transition-colors
                    "
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <DisconnectFromQuickBooks
                onDisconnect={() => setShowConfirm(true)}
                companyName={companyName}
              />
            )}
          </>
        ) : (
          <div className="space-y-3">
            <p className="text-sm text-gray-600">
              Connect your QuickBooks Online account to automatically
              sync payments and invoices.
            </p>
            <ConnectToQuickBooks />
          </div>
        )}
      </div>
    </div>
  );
}
