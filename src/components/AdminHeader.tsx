"use client";

import React from "react";

/**
 * Branded header bar for the admin area: PaySync logo + wordmark
 * (by Perspective Productions), with an optional right-side slot for
 * page actions (e.g. Sign out, Back link).
 */
export function AdminHeader({ right }: { right?: React.ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: "24px",
        flexWrap: "wrap",
        gap: "12px",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
        <img
          src="/logo.png"
          alt="PaySync"
          style={{ width: "36px", height: "36px", borderRadius: "8px" }}
        />
        <div style={{ lineHeight: 1.2 }}>
          <div style={{ fontWeight: 700, fontSize: "17px", color: "#111827" }}>
            PaySync
          </div>
          <div style={{ fontSize: "11px", color: "#9ca3af" }}>
            by Perspective Productions
          </div>
        </div>
      </div>
      {right}
    </div>
  );
}
