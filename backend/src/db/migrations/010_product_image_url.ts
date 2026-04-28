import type { Knex } from 'knex';

/**
 * Adds image_url column to products so dealers can attach a product photo.
 * Files themselves live on disk under uploads/products/<dealerId>/<file>;
 * this column stores the relative URL (e.g. /uploads/products/<dealer>/<f>.jpg).
 */
export async function up(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('products', 'image_url');
  if (!has) {
    await knex.schema.alterTable('products', (t) => {
      t.text('image_url').nullable();
    });
  }
}

export async function down(knex: Knex): Promise<void> {
  const has = await knex.schema.hasColumn('products', 'image_url');
  if (has) {
    await knex.schema.alterTable('products', (t) => {
      t.dropColumn('image_url');
    });
  }
}
