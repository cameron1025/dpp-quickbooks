-- ============================================================
-- DPP × QuickBooks Integration — Production Schema (Migration 002)
-- ============================================================
-- Reconciles the database with everything the application code actually
-- reads/writes. Safe to run on top of scripts/001_schema.sql and
-- sql/add-retry-columns.sql. Fully IDEMPOTENT — re-running is a no-op.
--
-- Run in the Supabase SQL Editor (or via migration tooling).
--
-- What this adds / fixes:
--   1. tracked_invoices            (invoice tracking for reminders)
--   2. invoice_emails              (sent-email log + idempotency)
--   3. merchants.reminder_* columns (reminder configuration)
--   4. merchants.dpp_merchant_id index
--   5. sync_log retry columns + WIDENED status CHECK
--      (code writes 'synced'/'failed_retrying'/'failed_permanent', which
--       the original CHECK rejected — every retry write threw before this)
--   6. RLS + service-role policies + updated_at triggers for new tables

-- ── 1. Tracked Invoices ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS tracked_invoices (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  qb_invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  customer_email TEXT,
  customer_name TEXT,
  amount NUMERIC(12, 2),
  due_date DATE,
  balance_due NUMERIC(12, 2),
  status TEXT NOT NULL DEFAULT 'open'
    CHECK (status IN ('open', 'paid', 'voided')),
  pay_now_url TEXT,
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Required by the upsert onConflict: 'merchant_id,qb_invoice_id'
  CONSTRAINT tracked_invoices_merchant_invoice_key UNIQUE (merchant_id, qb_invoice_id)
);

CREATE INDEX IF NOT EXISTS idx_tracked_invoices_merchant_status
  ON tracked_invoices (merchant_id, status);
CREATE INDEX IF NOT EXISTS idx_tracked_invoices_due
  ON tracked_invoices (due_date);

-- ── 2. Invoice Emails (sent log + idempotency) ──────────────

CREATE TABLE IF NOT EXISTS invoice_emails (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  qb_invoice_id TEXT NOT NULL,
  invoice_number TEXT,
  customer_email TEXT,
  customer_name TEXT,
  amount NUMERIC(12, 2),
  due_date DATE,
  email_type TEXT NOT NULL
    CHECK (email_type IN ('initial', 'before_due', 'due_today',
                          'overdue_3', 'overdue_7', 'overdue_14')),
  resend_message_id TEXT,
  status TEXT NOT NULL DEFAULT 'sent'
    CHECK (status IN ('sent', 'failed')),
  error_message TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- The code treats (merchant, invoice, email_type) as send-once.
  CONSTRAINT invoice_emails_merchant_invoice_type_key
    UNIQUE (merchant_id, qb_invoice_id, email_type)
);

CREATE INDEX IF NOT EXISTS idx_invoice_emails_merchant
  ON invoice_emails (merchant_id);

-- ── 3. Merchant reminder configuration columns ──────────────
-- Defaults mirror DEFAULT_CONFIG in components/quickbooks/ReminderSettings.tsx

ALTER TABLE merchants
  ADD COLUMN IF NOT EXISTS reminders_enabled        BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS reminder_send_initial    BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_from_name       TEXT    NOT NULL DEFAULT 'Billing',
  ADD COLUMN IF NOT EXISTS reminder_reply_to        TEXT,
  ADD COLUMN IF NOT EXISTS reminder_before_due_days INTEGER NOT NULL DEFAULT 3,
  ADD COLUMN IF NOT EXISTS reminder_on_due_date     BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_overdue_3       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_overdue_7       BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS reminder_overdue_14      BOOLEAN NOT NULL DEFAULT true;

-- Speeds the scheduler's `.eq('reminders_enabled', true)` scan.
CREATE INDEX IF NOT EXISTS idx_merchants_reminders_enabled
  ON merchants (reminders_enabled) WHERE reminders_enabled = true;

-- ── 4. dpp_merchant_id index (column already exists) ────────
-- Used by /api/webhooks/dpp lookups and resolve-merchant.ts

CREATE INDEX IF NOT EXISTS idx_merchants_dpp_merchant
  ON merchants (dpp_merchant_id);

-- ── 5. sync_log: retry columns + widened status CHECK ───────
-- (folds in sql/add-retry-columns.sql so a single migration suffices)

ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS retry_count   INTEGER DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payload       JSONB;

CREATE INDEX IF NOT EXISTS idx_sync_log_retry
  ON sync_log (status, retry_count, created_at)
  WHERE status IN ('failed', 'failed_retrying');

-- Widen the status CHECK to include every value the code writes.
-- The original inline constraint is auto-named sync_log_status_check.
ALTER TABLE sync_log DROP CONSTRAINT IF EXISTS sync_log_status_check;
ALTER TABLE sync_log ADD CONSTRAINT sync_log_status_check
  CHECK (status IN (
    'pending', 'success', 'failed', 'skipped',
    'synced', 'failed_retrying', 'failed_permanent'
  ));

-- ── 6. Row Level Security for new tables ────────────────────
-- Mirror the service-role-only policy pattern from 001_schema.sql.

ALTER TABLE tracked_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE invoice_emails   ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'tracked_invoices'
      AND policyname = 'Service role full access on tracked_invoices'
  ) THEN
    CREATE POLICY "Service role full access on tracked_invoices"
      ON tracked_invoices FOR ALL
      USING (auth.role() = 'service_role');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'invoice_emails'
      AND policyname = 'Service role full access on invoice_emails'
  ) THEN
    CREATE POLICY "Service role full access on invoice_emails"
      ON invoice_emails FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

-- ── 7. updated_at trigger for tracked_invoices ──────────────
-- Reuses update_updated_at_column() defined in 001_schema.sql.

DROP TRIGGER IF EXISTS update_tracked_invoices_updated_at ON tracked_invoices;
CREATE TRIGGER update_tracked_invoices_updated_at
  BEFORE UPDATE ON tracked_invoices
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
