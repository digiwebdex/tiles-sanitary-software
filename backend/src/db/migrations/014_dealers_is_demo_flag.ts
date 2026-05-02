import type { Knex } from 'knex';

/**
 * Phase A — Demo account read-only mode.
 *
 * Adds an `is_demo` boolean to dealers. When true, every backend mutation
 * (POST/PUT/PATCH/DELETE) under the demo dealer's tenant is rejected by the
 * `demoReadOnly` middleware. The flag also flows into the JWT payload so
 * the frontend can render a banner and disable mutating UI.
 *
 * The dealer attached to dealer@tileserp.com (Demo Tiles Store) is marked
 * as the canonical demo tenant.
 */
export async function up(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('dealers', 'is_demo');
  if (!hasColumn) {
    await knex.schema.alterTable('dealers', (t) => {
      t.boolean('is_demo').notNullable().defaultTo(false);
    });
  }

  // Mark the demo dealer (linked to dealer@tileserp.com).
  // Two strategies in case naming drifts:
  //   1. Profile lookup by email → dealer_id
  //   2. Fallback by dealer name "Demo Tiles Store"
  const profile = await knex('profiles')
    .where({ email: 'dealer@tileserp.com' })
    .first();

  if (profile?.dealer_id) {
    await knex('dealers').where({ id: profile.dealer_id }).update({ is_demo: true });
  } else {
    await knex('dealers')
      .where({ name: 'Demo Tiles Store' })
      .update({ is_demo: true });
  }
}

export async function down(knex: Knex): Promise<void> {
  const hasColumn = await knex.schema.hasColumn('dealers', 'is_demo');
  if (hasColumn) {
    await knex.schema.alterTable('dealers', (t) => {
      t.dropColumn('is_demo');
    });
  }
}
