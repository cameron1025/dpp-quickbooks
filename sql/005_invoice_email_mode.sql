-- ============================================================
-- DPP × QuickBooks Integration — Invoice email mode (Migration 005)
-- ============================================================
-- Per-merchant choice of how the Deluxe pay link reaches the customer on a new
-- invoice:
--   'paysync'   — PaySync sends its own branded email with the pay link
--                 (default; only when the merchant didn't send from QuickBooks)
--   'qb_native' — PaySync embeds the pay link in the invoice's "message
--                 displayed on invoice" so it rides QuickBooks' native email /
--                 PDF / hosted invoice view; PaySync skips its own initial email
--
-- Idempotent. Run in the Supabase SQL Editor.

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS invoice_email_mode TEXT NOT NULL DEFAULT 'paysync';
