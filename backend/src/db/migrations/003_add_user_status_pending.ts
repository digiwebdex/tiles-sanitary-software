import type { Knex } from 'knex';

/**
 * Add 'pending' to the user_status enum so newly self-signed-up users sit in
 * a pre-approval state until a Super Admin activates them. Existing users
 * keep their current status.
 *
 * Idempotent: ALTER TYPE … ADD VALUE IF NOT EXISTS is safe to re-run.
 */
export async function up(knex: Knex): Promise<void> {
  await knex.raw(`ALTER TYPE user_status ADD VALUE IF NOT EXISTS 'pending'`);
}

export async function down(_knex: Knex): Promise<void> {
  // Postgres does not support removing enum values without rebuilding the type.
  // Intentional no-op — leaving 'pending' in place is harmless on rollback.
}
