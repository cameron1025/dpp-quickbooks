-- 007_qb_token_refresh_lock.sql
-- Cross-process refresh lock so only ONE container refreshes a merchant's QB
-- token at a time. Without it, two containers running together during a Railway
-- deploy overlap can refresh with the same refresh token — Intuit treats that as
-- a token-family fork and REVOKES the whole family, killing the connection (the
-- recurring "Degraded" health after deploys).
--
-- Far-past NOT NULL default so the lock is never NULL and can be claimed with a
-- simple `refresh_lock_until < now()` (no OR-with-null needed). token-manager.ts
-- claims it atomically before refreshing and releases it after. Idempotent.

ALTER TABLE qb_tokens
  ADD COLUMN IF NOT EXISTS refresh_lock_until timestamptz NOT NULL
  DEFAULT '1970-01-01T00:00:00Z';
