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
    CREATE TABLE IF NOT EXISTS public.backup_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      backup_type text NOT NULL,
      database_name text NOT NULL,
      app_name text NOT NULL DEFAULT 'unknown',
      file_name text,
      file_size bigint,
      storage_location text DEFAULT 'google_drive',
      status text NOT NULL DEFAULT 'pending',
      error_message text,
      started_at timestamptz DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS public.restore_logs (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      backup_log_id uuid REFERENCES public.backup_logs(id),
      backup_file_name text NOT NULL,
      backup_type text NOT NULL,
      database_name text NOT NULL,
      app_name text NOT NULL DEFAULT 'unknown',
      initiated_by uuid,
      initiated_by_name text,
      status text NOT NULL DEFAULT 'pending',
      pre_restore_backup_taken boolean DEFAULT false,
      error_message text,
      logs text,
      started_at timestamptz DEFAULT now(),
      completed_at timestamptz,
      created_at timestamptz DEFAULT now()
    );
  `);

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
