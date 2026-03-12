// ============================================================
// GET /api/health
// ============================================================
// Health check endpoint for Railway deployment monitoring.

import { NextResponse } from "next/server";

export async function GET() {
  return NextResponse.json({
    status: "ok",
    timestamp: new Date().toISOString(),
    version: process.env.npm_package_version || "1.0.0",
  });
}
