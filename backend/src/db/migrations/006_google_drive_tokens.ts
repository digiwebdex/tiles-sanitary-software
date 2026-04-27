import type { Knex } from 'knex';

/**
 * Per-user Google Drive OAuth tokens. Used by Super Admins to connect their
 * own Google Drive account for picking backup files to restore.
 *
 * Scope: drive.file (only files explicitly opened/created by this app via
 * Google Picker). Each Super Admin connects their own Drive.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    CREATE TABLE IF NOT EXISTS public.google_drive_tokens (
      user_id        UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
      google_email   TEXT,
      access_token   TEXT NOT NULL,
      refresh_token  TEXT,
      token_type     TEXT DEFAULT 'Bearer',
      scope          TEXT,
      expires_at     TIMESTAMPTZ NOT NULL,
      created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
    );
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`DROP TABLE IF EXISTS public.google_drive_tokens;`);
}
