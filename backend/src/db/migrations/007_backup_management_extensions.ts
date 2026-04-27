import type { Knex } from 'knex';

/**
 * Manual Backup / Upload / Restore extension.
 *
 * Adds source labels, local-path tracking, checksums, audit fields, and
 * notes to the backup_logs and restore_logs tables. Existing automatic
 * backup flow is preserved unchanged — new rows simply default to
 * source = 'auto' so historical data stays consistent.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE public.backup_logs
      ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'auto',
      ADD COLUMN IF NOT EXISTS local_path TEXT,
      ADD COLUMN IF NOT EXISTS checksum_sha256 TEXT,
      ADD COLUMN IF NOT EXISTS version TEXT,
      ADD COLUMN IF NOT EXISTS created_by UUID,
      ADD COLUMN IF NOT EXISTS created_by_name TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT;
  `);

  await knex.raw(`
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
  `);

  await knex.raw(`
    CREATE INDEX IF NOT EXISTS backup_logs_source_idx
      ON public.backup_logs (source);
    CREATE INDEX IF NOT EXISTS backup_logs_created_at_idx
      ON public.backup_logs (created_at DESC);
  `);

  await knex.raw(`
    ALTER TABLE public.restore_logs
      ADD COLUMN IF NOT EXISTS notes  TEXT,
      ADD COLUMN IF NOT EXISTS source TEXT;
    CREATE INDEX IF NOT EXISTS restore_logs_created_at_idx
      ON public.restore_logs (created_at DESC);
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE public.restore_logs
      DROP COLUMN IF EXISTS notes,
      DROP COLUMN IF EXISTS source;
  `);
  await knex.raw(`
    ALTER TABLE public.backup_logs
      DROP CONSTRAINT IF EXISTS backup_logs_source_chk,
      DROP COLUMN IF EXISTS source,
      DROP COLUMN IF EXISTS local_path,
      DROP COLUMN IF EXISTS checksum_sha256,
      DROP COLUMN IF EXISTS version,
      DROP COLUMN IF EXISTS created_by,
      DROP COLUMN IF EXISTS created_by_name,
      DROP COLUMN IF EXISTS notes;
  `);
}
