// ============================================================
// Connect to QuickBooks Button
// ============================================================
// Per Intuit's updated branding (2021+): text-only button,
// no logo inside the button. Green (#2CA01C) with white text.
// Available in standard and small sizes.
// Ref: https://blogs.intuit.com/2021/04/01/intuit-and-quickbooks-buttons-update/

"use client";

import React from "react";

interface ConnectToQuickBooksProps {
  size?: "standard" | "small";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function ConnectToQuickBooks({
  size = "standard",
  disabled = false,
  loading = false,
  onClick,
  className = "",
}: ConnectToQuickBooksProps) {
  const handleClick = () => {
    if (disabled || loading) return;

    if (onClick) {
      onClick();
    } else {
      // Default: redirect to the OAuth connect endpoint
      window.location.href = "/api/quickbooks/connect";
    }
  };

  const sizeStyles =
    size === "standard"
      ? "px-6 py-3 text-base min-w-[220px]"
      : "px-4 py-2 text-sm min-w-[180px]";

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center
        bg-[#2CA01C] hover:bg-[#108000] active:bg-[#0A6600]
        text-white font-semibold
        rounded-[4px]
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeStyles}
        ${className}
      `}
      aria-label="Connect to QuickBooks"
      type="button"
    >
      {loading ? (
        <>
          <svg
            className="animate-spin -ml-1 mr-2 h-4 w-4"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
            />
          </svg>
          Connecting…
        </>
      ) : (
        "Connect to QuickBooks"
      )}
    </button>
  );
}

// ── Disconnect Button ───────────────────────────────────────
// Intuit requirement: Disconnect must be in the same location
// as Connect. After disconnect, Connect button re-appears.

interface DisconnectFromQuickBooksProps {
  onDisconnect: () => void;
  loading?: boolean;
  companyName?: string;
  className?: string;
}

export function DisconnectFromQuickBooks({
  onDisconnect,
  loading = false,
  companyName,
  className = "",
}: DisconnectFromQuickBooksProps) {
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {companyName && (
        <p className="text-sm text-gray-600">
          Connected to <span className="font-medium">{companyName}</span>
        </p>
      )}
      <button
        onClick={onDisconnect}
        disabled={loading}
        className="
          inline-flex items-center justify-center
          bg-white hover:bg-gray-50 active:bg-gray-100
          text-[#393A3D] font-medium
          border border-[#BABEC5]
          rounded-[4px]
          px-4 py-2 text-sm
          transition-colors duration-150
          focus:outline-none focus:ring-2 focus:ring-[#2CA01C] focus:ring-offset-2
          disabled:opacity-50 disabled:cursor-not-allowed
        "
        type="button"
      >
        {loading ? "Disconnecting…" : "Disconnect from QuickBooks"}
      </button>
    </div>
  );
}
