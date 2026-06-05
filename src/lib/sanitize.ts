// ============================================================
// Input Sanitization & Validation
// ============================================================
// Security hardening: XSS prevention, input validation via Zod

import { z } from "zod";

// ── Sanitization ────────────────────────────────────────────

/**
 * Strip HTML tags and dangerous characters from a string.
 * Server-side only — no DOM dependency.
 */
export function sanitizeString(input: string): string {
  return input
    .replace(/[<>]/g, "") // Strip angle brackets
    .replace(/javascript:/gi, "") // Strip JS protocol
    .replace(/on\w+\s*=/gi, "") // Strip event handlers
    .replace(/data:/gi, "") // Strip data URIs
    .replace(/vbscript:/gi, "") // Strip VBScript
    .trim();
}

/**
 * Sanitize all string values in an object recursively.
 */
export function sanitizeObject<T extends Record<string, unknown>>(
  obj: T
): T {
  const sanitized: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(obj)) {
    if (typeof value === "string") {
      sanitized[key] = sanitizeString(value);
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      sanitized[key] = sanitizeObject(value as Record<string, unknown>);
    } else if (Array.isArray(value)) {
      sanitized[key] = value.map((item) =>
        typeof item === "string"
          ? sanitizeString(item)
          : typeof item === "object" && item !== null
          ? sanitizeObject(item as Record<string, unknown>)
          : item
      );
    } else {
      sanitized[key] = value;
    }
  }

  return sanitized as T;
}

// ── Validation Schemas ──────────────────────────────────────

export const realmIdSchema = z
  .string()
  .regex(/^\d{1,20}$/, "Invalid QuickBooks realm ID");

export const merchantIdSchema = z
  .string()
  .uuid("Invalid merchant ID format");

export const emailSchema = z
  .string()
  .email("Invalid email address")
  .max(254, "Email too long");

export const amountSchema = z
  .number()
  .positive("Amount must be positive")
  .max(999999999.99, "Amount exceeds maximum")
  .multipleOf(0.01, "Amount must have at most 2 decimal places");

export const currencySchema = z
  .string()
  .length(3, "Currency must be 3-character ISO code")
  .regex(/^[A-Z]{3}$/, "Invalid currency code");

export const webhookPayloadSchema = z.object({
  eventNotifications: z.array(
    z.object({
      realmId: realmIdSchema,
      dataChangeEvent: z.object({
        entities: z.array(
          z.object({
            name: z.string(),
            id: z.string(),
            operation: z.enum(["Create", "Update", "Delete", "Merge", "Void"]),
            lastUpdated: z.string(),
          })
        ),
      }),
    })
  ),
});

export const paymentSyncSchema = z.object({
  transaction_id: z.string().min(1).max(100),
  amount: amountSchema,
  currency: currencySchema,
  customer_email: emailSchema.optional(),
  customer_name: z.string().max(200).optional(),
  invoice_number: z.string().max(50).optional(),
  payment_method: z.string().max(50),
  metadata: z.record(z.string()).optional(),
});

export const merchantSettingsSchema = z.object({
  auto_sync_payments: z.boolean(),
  sync_frequency: z.enum(["realtime", "hourly", "daily"]),
  default_deposit_account: z.string().optional(),
  default_income_account: z.string().optional(),
  default_refund_item: z.string().optional(),
  webhook_url: z.string().url().optional().or(z.literal("")),
});

// Reminder settings — top-level merchant columns, edited via
// /api/merchant/reminder-settings. Shape matches ReminderConfig in
// components/quickbooks/ReminderSettings.tsx.
export const reminderSettingsSchema = z.object({
  reminders_enabled: z.boolean(),
  reminder_send_initial: z.boolean(),
  reminder_before_due_days: z.number().int().min(0).max(30),
  reminder_on_due_date: z.boolean(),
  reminder_overdue_3: z.boolean(),
  reminder_overdue_7: z.boolean(),
  reminder_overdue_14: z.boolean(),
  reminder_from_name: z.string().max(100),
  reminder_reply_to: z.string().email().max(254).or(z.literal("")),
});

// DPP/Deluxe gateway webhook payload. Deluxe does not sign webhooks, so this
// structural check is defense-in-depth alongside the URL secret + IP allowlist
// (the primary auth) — not the gatekeeper. It is intentionally lenient: the
// Transaction and ACH Reject events carry very different field sets (verified
// against captured payloads), so we only require the two fields present in
// BOTH (EventType, MID) and let everything else pass through for the handler
// to read defensively. Requiring more (e.g. TransactionAmount) would reject
// real ACH Reject events, which instead carry `Amount`.
export const dppWebhookPayloadSchema = z
  .object({
    EventType: z.string().min(1).max(50),
    MID: z.string().min(1).max(64),
  })
  .passthrough();

// ── CSRF Token ──────────────────────────────────────────────

export function generateCSRFToken(): string {
  const crypto = require("crypto");
  return crypto.randomBytes(32).toString("hex");
}

export function validateCSRFToken(
  token: string | null,
  storedToken: string
): boolean {
  if (!token) return false;
  const crypto = require("crypto");
  return crypto.timingSafeEqual(
    Buffer.from(token),
    Buffer.from(storedToken)
  );
}
