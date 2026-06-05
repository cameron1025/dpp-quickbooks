// POST /api/admin/login  — exchange the shared password for an admin session cookie
// DELETE /api/admin/login — log out

import { NextRequest, NextResponse } from "next/server";
import {
  verifyAdminPassword,
  adminCookieValue,
  ADMIN_COOKIE_NAME,
} from "@/lib/admin-auth";

export async function POST(request: NextRequest) {
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

export async function DELETE() {
  const res = NextResponse.json({ success: true });
  res.cookies.delete(ADMIN_COOKIE_NAME);
  return res;
}
