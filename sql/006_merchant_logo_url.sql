-- 006_merchant_logo_url.sql
-- Per-merchant logo (public image URL) for branding the customer-facing payment
-- page (/pay/[token]) and, optionally, the invoice email. Rendered on OUR page so
-- sizing is fully under our control. Falls back to the merchant name when null.
-- Idempotent.

ALTER TABLE merchants ADD COLUMN IF NOT EXISTS logo_url text;
