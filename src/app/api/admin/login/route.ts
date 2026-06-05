// POST /api/admin/login  — exchange the shared password for an admin session cookie
// DELETE /api/admin/login — log out

import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassword,
  adminCookieValue,
  ADMIN_COOKIE_NAME,
} from "@/lib/admin-auth";
import { withRateLimit } from "@/lib/rate-limit";

async function handleLogin(request: NextRequest) {
  const body = await request.json().catch(() => ({}));
  const password = typeof body?.password === "string" ? body.password : "";

  if (!process.env.ADMIN_PASSWORD) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  }

  if (!password || !(await verifyAdminPassword(password))) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const value = await adminCookieValue();
  if (!value) {
    return NextResponse.json({ error: "Admin not configured" }, { status: 500 });
  }

  const res = NextResponse.json({ success: true });
  res.cookies.set(ADMIN_COOKIE_NAME, value, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 12, // 12 hours
    path: "/",
  });
  return res;
}

// Brute-force protection: 5 attempts per IP per 15 minutes (returns 429 after).
// Note: the limiter is in-memory per instance — good enough to blunt guessing;
// for multi-instance, back it with a shared store later.
export const POST = withRateLimit(handleLogin, {
  max: 5,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "admin-login",
});

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
