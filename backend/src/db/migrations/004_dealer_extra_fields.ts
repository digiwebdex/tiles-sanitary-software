import type { Knex } from 'knex';

/**
 * Extend `dealers` with the business-profile fields that the Super Admin
 * Edit Dealer screen exposes: contact email, owner name, business type,
 * full address breakdown (city / district / country / postal code),
 * regulatory IDs (tax_id, trade_license_no), website, logo, and notes.
 *
 * Also adds an `updated_at` timestamp so audit + concurrency hooks have
 * a column to touch. Defaults are conservative so existing rows survive.
 *
 * Idempotent: every column is added with IF NOT EXISTS.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE public.dealers
      ADD COLUMN IF NOT EXISTS email TEXT,
      ADD COLUMN IF NOT EXISTS owner_name TEXT,
      ADD COLUMN IF NOT EXISTS business_type TEXT,
      ADD COLUMN IF NOT EXISTS city TEXT,
      ADD COLUMN IF NOT EXISTS district TEXT,
      ADD COLUMN IF NOT EXISTS country TEXT DEFAULT 'Bangladesh',
      ADD COLUMN IF NOT EXISTS postal_code TEXT,
      ADD COLUMN IF NOT EXISTS tax_id TEXT,
      ADD COLUMN IF NOT EXISTS trade_license_no TEXT,
      ADD COLUMN IF NOT EXISTS website TEXT,
      ADD COLUMN IF NOT EXISTS logo_url TEXT,
      ADD COLUMN IF NOT EXISTS notes TEXT,
      ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
  `);
}

export async function down(knex: Knex): Promise<void> {
  await knex.raw(`
    ALTER TABLE public.dealers
      DROP COLUMN IF EXISTS email,
      DROP COLUMN IF EXISTS owner_name,
      DROP COLUMN IF EXISTS business_type,
      DROP COLUMN IF EXISTS city,
      DROP COLUMN IF EXISTS district,
      DROP COLUMN IF EXISTS country,
      DROP COLUMN IF EXISTS postal_code,
      DROP COLUMN IF EXISTS tax_id,
      DROP COLUMN IF EXISTS trade_license_no,
      DROP COLUMN IF EXISTS website,
      DROP COLUMN IF EXISTS logo_url,
      DROP COLUMN IF EXISTS notes,
      DROP COLUMN IF EXISTS updated_at;
  `);
}
