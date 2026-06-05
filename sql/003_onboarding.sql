-- ============================================================
-- DPP × QuickBooks Integration — Onboarding (Migration 003)
-- ============================================================
-- Adds columns to track automatic DPP webhook subscription, set during the
-- self-serve onboarding flow. Safe to run on top of 001/002. Idempotent.
--
-- Run in the Supabase SQL Editor.

ALTER TABLE merchants
  -- Map of eventType -> Deluxe eventSubscriptionId (e.g.
  -- {"TRANSACTION":"382","ACH REJECT":"383"}). Lets us unsubscribe later and
  -- detect that a merchant is already subscribed (idempotency).
  ADD COLUMN IF NOT EXISTS dpp_subscription_ids JSONB,
  -- When the merchant's DPP webhooks were subscribed. NULL = not subscribed
  -- (surfaced in the admin health view; re-subscribable).
  ADD COLUMN IF NOT EXISTS dpp_subscribed_at TIMESTAMPTZ;

COMMENT ON COLUMN merchants.dpp_subscription_ids IS
  'Deluxe eventSubscriptionIds by eventType, captured at onboarding';
COMMENT ON COLUMN merchants.dpp_subscribed_at IS
  'Timestamp DPP webhooks were subscribed for this merchant; NULL if not subscribed';
