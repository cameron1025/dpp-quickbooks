-- Migration: Add retry support columns to sync_log
-- Run this in Supabase SQL editor before deploying the retry feature.

ALTER TABLE sync_log
  ADD COLUMN IF NOT EXISTS retry_count integer DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_retry_at timestamptz,
  ADD COLUMN IF NOT EXISTS payload jsonb;

CREATE INDEX IF NOT EXISTS idx_sync_log_retry
  ON sync_log (status, retry_count, created_at)
  WHERE status IN ('failed', 'failed_retrying');

CREATE INDEX IF NOT EXISTS idx_sync_log_created
  ON sync_log (created_at DESC);

COMMENT ON COLUMN sync_log.retry_count IS 'Number of retry attempts made';
COMMENT ON COLUMN sync_log.last_retry_at IS 'Timestamp of most recent retry attempt';
COMMENT ON COLUMN sync_log.payload IS 'Original transaction payload for replay';
