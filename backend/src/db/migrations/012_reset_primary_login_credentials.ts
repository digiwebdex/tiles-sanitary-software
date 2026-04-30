import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

const PRIMARY_ACCOUNTS = [
  { email: 'bditengineer@gmail.com', password: 'KeyaIq11151000@#' },
  { email: 'dealer@tileserp.com', password: 'Dealer@12345' },
];

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    for (const account of PRIMARY_ACCOUNTS) {
      const email = account.email.toLowerCase().trim();
      const user = await trx('users').where({ email }).first();
      if (!user) continue;

      const passwordHash = await bcrypt.hash(account.password, 12);
      await trx('users').where({ id: user.id }).update({
        password_hash: passwordHash,
        status: 'active',
        updated_at: knex.fn.now(),
      });
      await trx('profiles').where({ id: user.id }).update({
        status: 'active',
        updated_at: knex.fn.now(),
      });
      await trx('login_attempts').where({ email }).del();
      await trx('refresh_tokens')
        .where({ user_id: user.id })
        .whereNull('revoked_at')
        .update({ revoked_at: knex.fn.now() });
    }
  });
}

export async function down(_knex: Knx): Promise<void> {
  // Intentionally no-op: this migration repairs production login access.
}
