-- Extend backup_logs and restore_logs to support multi-source backups
-- (automatic, VPS local copy, manual upload), checksums, and audit fields.

ALTER TABLE public.backup_logs
  ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto',
  ADD COLUMN IF NOT EXISTS local_path TEXT,
  ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
  ADD COLUMN IF NOT EXISTS version TEXT,
  ADD COLUMN IF NOT EXISTS created_by UUID,
  ADD COLUMN IF NOT EXISTS created_by_name TEXT,
  ADD COLUMN IF NOT EXISTS notes TEXT;

-- Constrain source to known values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'backup_logs_source_chk'
  ) THEN
    ALTER TABLE public.backup_logs
      ADD CONSTRAINT backup_logs_source_chk
      CHECK (source IN ('auto','vps_local','uploaded'));
  END IF;
END$$;

CREATE INDEX IF NOT EXISTS backup_logs_source_idx ON public.backup_logs (source);
CREATE INDEX IF NOT EXISTS backup_logs_created_at_idx ON public.backup_logs (created_at DESC);

ALTER TABLE public.restore_logs
  ADD COLUMN IF NOT EXISTS notes TEXT,
  ADD COLUMN IF NOT EXISTS source TEXT;

CREATE INDEX IF NOT EXISTS restore_logs_created_at_idx ON public.restore_logs (created_at DESC);