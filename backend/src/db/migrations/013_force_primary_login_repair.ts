import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

const SUPER_ADMIN_EMAIL = 'bditengineer@gmail.com';
const SUPER_ADMIN_PASSWORD = 'KeyaIq11151000@#';
const DEALER_ADMIN_EMAIL = 'dealer@tileserp.com';
const DEALER_ADMIN_PASSWORD = 'Dealer@12345';

async function clearAuthState(knex: Knex, trx: Knex.Transaction, userId: string, email: string) {
  await trx('login_attempts').where({ email }).del();
  await trx('refresh_tokens')
    .where({ user_id: userId })
    .whereNull('revoked_at')
    .update({ revoked_at: knex.fn.now() });
}

async function ensureUser(
  knex: Knex,
  trx: Knex.Transaction,
  input: {
    email: string;
    password: string;
    name: string;
    role: 'super_admin' | 'dealer_admin';
    dealerId: string | null;
  },
): Promise<string> {
  const email = input.email.toLowerCase().trim();
  const passwordHash = await bcrypt.hash(input.password, 12);
  const existing = await trx('users').where({ email }).first();
  let userId: string;

  if (existing) {
    userId = existing.id;
    await trx('users').where({ id: userId }).update({
      email,
      password_hash: passwordHash,
      name: input.name,
      status: 'active',
      updated_at: knex.fn.now(),
    });
  } else {
    const [created] = await trx('users')
      .insert({ email, password_hash: passwordHash, name: input.name, status: 'active' })
      .returning('id');
    userId = created.id ?? created;
  }

  await trx('profiles')
    .insert({
      id: userId,
      name: input.name,
      email,
      dealer_id: input.dealerId,
      status: 'active',
    })
    .onConflict('id')
    .merge({
      name: input.name,
      email,
      dealer_id: input.dealerId,
      status: 'active',
      updated_at: knex.fn.now(),
    });

  await trx('user_roles')
    .insert({ user_id: userId, role: input.role })
    .onConflict(['user_id', 'role'])
    .ignore();

  await clearAuthState(knex, trx, userId, email);
  return userId;
}

export async function up(knex: Knex): Promise<void> {
  await knex.transaction(async (trx) => {
    await ensureUser(knex, trx, {
      email: SUPER_ADMIN_EMAIL,
      password: SUPER_ADMIN_PASSWORD,
      name: 'Super Admin',
      role: 'super_admin',
      dealerId: null,
    });

    let dealer = await trx('dealers').where({ name: 'Demo Tiles Store' }).first();
    if (!dealer) {
      const [createdDealer] = await trx('dealers')
        .insert({ name: 'Demo Tiles Store', phone: '01700000000', address: 'Demo Address, Dhaka', status: 'active' })
        .returning('*');
      dealer = createdDealer;
    } else {
      await trx('dealers').where({ id: dealer.id }).update({ status: 'active' });
    }

    const dealerId = dealer.id;
    await ensureUser(knex, trx, {
      email: DEALER_ADMIN_EMAIL,
      password: DEALER_ADMIN_PASSWORD,
      name: 'Demo Dealer Owner',
      role: 'dealer_admin',
      dealerId,
    });

    await trx('invoice_sequences')
      .insert({ dealer_id: dealerId, next_invoice_no: 1, next_challan_no: 1 })
      .onConflict('dealer_id')
      .ignore();

    let plan = await trx('plans').whereRaw('lower(name) = ?', ['starter']).first();
    if (!plan) {
      plan = await trx('plans').orderBy('price_monthly', 'asc').first();
    }
    if (!plan) {
      const [createdPlan] = await trx('plans')
        .insert({ name: 'Starter', price_monthly: 999, price_yearly: 10000, max_users: 1 })
        .returning('*');
      plan = createdPlan;
    }

    const oneYearLater = new Date();
    oneYearLater.setFullYear(oneYearLater.getFullYear() + 1);
    const startDate = new Date().toISOString().slice(0, 10);
    const endDate = oneYearLater.toISOString().slice(0, 10);

    const latestSubscription = await trx('subscriptions')
      .where({ dealer_id: dealerId })
      .orderBy('start_date', 'desc')
      .orderBy('created_at', 'desc')
      .first();

    if (latestSubscription) {
      await trx('subscriptions').where({ id: latestSubscription.id }).update({
        plan_id: plan.id,
        status: 'active',
        billing_cycle: 'yearly',
        start_date: startDate,
        end_date: endDate,
      });
    } else {
      await trx('subscriptions').insert({
        dealer_id: dealerId,
        plan_id: plan.id,
        status: 'active',
        billing_cycle: 'yearly',
        start_date: startDate,
        end_date: endDate,
      });
    }
  });
}

export async function down(_knex: Knex): Promise<void> {
  // Intentionally no-op: this migration restores production login access.
}
