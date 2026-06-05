"use client";

import { useState } from "react";

export default function AdminLoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        window.location.href = "/admin";
      } else {
        setError("Incorrect password");
      }
    } catch {
      setError("Network error — please try again");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        minHeight: "100vh",
        background: "#f4f4f7",
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif',
        padding: "20px",
      }}
    >
      <form
        onSubmit={submit}
        style={{
          background: "#fff",
          borderRadius: "12px",
          boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
          padding: "36px",
          width: "100%",
          maxWidth: "380px",
        }}
      >
        <h1 style={{ fontSize: "20px", margin: "0 0 20px", color: "#1a1a1a" }}>
          Admin sign in
        </h1>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Admin password"
          autoFocus
          style={{
            width: "100%",
            padding: "12px 14px",
            fontSize: "15px",
            border: "1px solid #d0d0d7",
            borderRadius: "8px",
            marginBottom: "14px",
            boxSizing: "border-box",
          }}
        />
        {error && (
          <p style={{ color: "#DC2626", fontSize: "13px", margin: "0 0 14px" }}>{error}</p>
        )}
        <button
          type="submit"
          disabled={busy}
          style={{
            width: "100%",
            padding: "12px",
            fontSize: "15px",
            fontWeight: 600,
            color: "#fff",
            background: busy ? "#7aa9f0" : "#2563EB",
            border: "none",
            borderRadius: "8px",
            cursor: busy ? "default" : "pointer",
          }}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    </div>
  );
}
