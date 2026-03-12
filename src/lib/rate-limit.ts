// ============================================================
// Rate Limiter — In-memory for development, Redis-compatible
// ============================================================

import { NextRequest, NextResponse } from "next/server";
import { logger } from "./logger";

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

// In-memory store (swap with Redis in production for multi-instance)
const store = new Map<string, RateLimitEntry>();

const DEFAULT_MAX = parseInt(process.env.RATE_LIMIT_MAX || "100", 10);
const DEFAULT_WINDOW_MS = parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000", 10);

export function getClientIP(request: NextRequest): string {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "unknown"
  );
}

export function rateLimit(
  key: string,
  options?: { max?: number; windowMs?: number }
): { allowed: boolean; remaining: number; resetAt: number } {
  const max = options?.max || DEFAULT_MAX;
  const windowMs = options?.windowMs || DEFAULT_WINDOW_MS;
  const now = Date.now();

  let entry = store.get(key);

  // Clean up or create new entry
  if (!entry || now > entry.resetAt) {
    entry = { count: 0, resetAt: now + windowMs };
    store.set(key, entry);
  }

  entry.count++;

  if (entry.count > max) {
    logger.warn("Rate limit exceeded", { key, count: entry.count, max });
    return { allowed: false, remaining: 0, resetAt: entry.resetAt };
  }

  return {
    allowed: true,
    remaining: max - entry.count,
    resetAt: entry.resetAt,
  };
}

/**
 * Rate limit middleware for API routes.
 */
export function withRateLimit(
  handler: (req: NextRequest) => Promise<NextResponse>,
  options?: { max?: number; windowMs?: number; keyPrefix?: string }
) {
  return async (request: NextRequest): Promise<NextResponse> => {
    const ip = getClientIP(request);
    const key = `${options?.keyPrefix || "api"}:${ip}`;
    const result = rateLimit(key, options);

    if (!result.allowed) {
      return NextResponse.json(
        {
          success: false,
          error: {
            code: "RATE_LIMIT_EXCEEDED",
            message: "Too many requests. Please try again later.",
          },
        },
        {
          status: 429,
          headers: {
            "Retry-After": Math.ceil(
              (result.resetAt - Date.now()) / 1000
            ).toString(),
            "X-RateLimit-Remaining": "0",
          },
        }
      );
    }

    const response = await handler(request);
    response.headers.set(
      "X-RateLimit-Remaining",
      result.remaining.toString()
    );
    return response;
  };
}

// Periodic cleanup (every 5 minutes)
if (typeof setInterval !== "undefined") {
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now > entry.resetAt) {
        store.delete(key);
      }
    });
  }, 5 * 60 * 1000);
}
