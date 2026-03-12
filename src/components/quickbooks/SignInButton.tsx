// ============================================================
// Sign In with Intuit Button
// ============================================================
// Per Intuit's updated branding: text-only, dark button.
// This is optional for App Store listing but recommended.
// If used, must verify emailVerified from OpenID profile.

"use client";

import React from "react";

interface SignInWithIntuitProps {
  size?: "standard" | "small";
  disabled?: boolean;
  loading?: boolean;
  onClick?: () => void;
  className?: string;
}

export function SignInWithIntuit({
  size = "standard",
  disabled = false,
  loading = false,
  onClick,
  className = "",
}: SignInWithIntuitProps) {
  const handleClick = () => {
    if (disabled || loading) return;

    if (onClick) {
      onClick();
    } else {
      window.location.href = "/api/quickbooks/connect";
    }
  };

  const sizeStyles =
    size === "standard"
      ? "px-6 py-3 text-base min-w-[200px]"
      : "px-4 py-2 text-sm min-w-[160px]";

  return (
    <button
      onClick={handleClick}
      disabled={disabled || loading}
      className={`
        inline-flex items-center justify-center
        bg-[#393A3D] hover:bg-[#2C2D30] active:bg-[#1A1A1D]
        text-white font-semibold
        rounded-[4px]
        transition-colors duration-150
        focus:outline-none focus:ring-2 focus:ring-[#393A3D] focus:ring-offset-2
        disabled:opacity-50 disabled:cursor-not-allowed
        ${sizeStyles}
        ${className}
      `}
      aria-label="Sign in with Intuit"
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
          Signing in…
        </>
      ) : (
        "Sign in with Intuit"
      )}
    </button>
  );
}
