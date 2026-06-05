-- ============================================================
-- DPP × QuickBooks Integration — Per-merchant DPP credentials (Migration 004)
-- ============================================================
-- Each client merchant has their OWN Deluxe MID + API credentials, so their
-- webhook subscriptions and payment links are created under THEIR account
-- (funds + events route correctly). Credentials are stored encrypted at rest
-- (AES-256-GCM, same as qb_tokens), keyed by the Deluxe MID.
--
-- Idempotent. Run in the Supabase SQL Editor.

CREATE TABLE IF NOT EXISTS dpp_credentials (
  -- Deluxe Merchant ID — the key that links the webhook payload, the merchant
  -- record (merchants.dpp_merchant_id), and these credentials.
  mid TEXT PRIMARY KEY,
  -- AES-256-GCM-encrypted JSON: { clientId, clientSecret, partnerToken }
  encrypted_credentials TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE dpp_credentials ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'dpp_credentials'
      AND policyname = 'Service role full access on dpp_credentials'
  ) THEN
    CREATE POLICY "Service role full access on dpp_credentials"
      ON dpp_credentials FOR ALL
      USING (auth.role() = 'service_role');
  END IF;
END $$;

DROP TRIGGER IF EXISTS update_dpp_credentials_updated_at ON dpp_credentials;
CREATE TRIGGER update_dpp_credentials_updated_at
  BEFORE UPDATE ON dpp_credentials
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
