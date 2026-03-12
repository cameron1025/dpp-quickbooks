-- ============================================================
-- DPP × QuickBooks Integration — Database Schema
-- ============================================================
-- Run in Supabase SQL Editor or via migration.
-- All tables use RLS (Row Level Security) for production.

-- ── Merchants ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS merchants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  email TEXT UNIQUE NOT NULL,
  company_name TEXT NOT NULL DEFAULT '',
  qb_realm_id TEXT,
  qb_connected BOOLEAN NOT NULL DEFAULT false,
  qb_connected_at TIMESTAMPTZ,
  qb_disconnected_at TIMESTAMPTZ,
  dpp_merchant_id TEXT,
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active', 'inactive', 'suspended')),
  settings JSONB NOT NULL DEFAULT '{
    "auto_sync_payments": true,
    "sync_frequency": "realtime"
  }'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_merchants_email ON merchants(email);
CREATE INDEX IF NOT EXISTS idx_merchants_realm ON merchants(qb_realm_id);
CREATE INDEX IF NOT EXISTS idx_merchants_status ON merchants(status);

-- ── QB Tokens (encrypted at rest) ───────────────────────────

CREATE TABLE IF NOT EXISTS qb_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL UNIQUE REFERENCES merchants(id) ON DELETE CASCADE,
  realm_id TEXT NOT NULL,
  encrypted_access_token TEXT NOT NULL,
  encrypted_refresh_token TEXT NOT NULL,
  access_token_expires_at TIMESTAMPTZ NOT NULL,
  refresh_token_expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_qb_tokens_merchant ON qb_tokens(merchant_id);
CREATE INDEX IF NOT EXISTS idx_qb_tokens_realm ON qb_tokens(realm_id);

-- ── Sync Log (audit trail) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS sync_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  merchant_id UUID NOT NULL REFERENCES merchants(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  direction TEXT NOT NULL CHECK (direction IN ('dpp_to_qb', 'qb_to_dpp')),
  entity_type TEXT NOT NULL,
  entity_id TEXT NOT NULL,
  qb_entity_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'success', 'failed', 'skipped')),
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_sync_log_merchant ON sync_log(merchant_id);
CREATE INDEX IF NOT EXISTS idx_sync_log_status ON sync_log(status);
CREATE INDEX IF NOT EXISTS idx_sync_log_created ON sync_log(created_at DESC);

-- ── Webhook Events (idempotency tracking) ───────────────────

CREATE TABLE IF NOT EXISTS webhook_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id TEXT UNIQUE NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('quickbooks', 'dpp')),
  event_type TEXT NOT NULL,
  realm_id TEXT,
  payload JSONB NOT NULL,
  processed BOOLEAN NOT NULL DEFAULT false,
  processed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_event ON webhook_events(event_id);
CREATE INDEX IF NOT EXISTS idx_webhook_events_processed ON webhook_events(processed);

-- ── Row Level Security ──────────────────────────────────────

ALTER TABLE merchants ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service role has full access (used by the app server)
-- No public/anon access to these tables

CREATE POLICY "Service role full access on merchants"
  ON merchants FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on qb_tokens"
  ON qb_tokens FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on sync_log"
  ON sync_log FOR ALL
  USING (auth.role() = 'service_role');

CREATE POLICY "Service role full access on webhook_events"
  ON webhook_events FOR ALL
  USING (auth.role() = 'service_role');

-- ── Updated_at Trigger ──────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_merchants_updated_at
  BEFORE UPDATE ON merchants
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_qb_tokens_updated_at
  BEFORE UPDATE ON qb_tokens
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
