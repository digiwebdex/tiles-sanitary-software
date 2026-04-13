import type { Knex } from 'knex';
import bcrypt from 'bcryptjs';

export async function seed(knex: Knex): Promise<void> {
  // Only seed if no users exist
  const existing = await knex('users').first();
  if (existing) {
    console.log('Seed skipped — users already exist');
    return;
  }

  const passwordHash = await bcrypt.hash('admin123456', 12);

  // 1. Create super admin user
  const [superAdminUser] = await knex('users').insert({
    email: 'admin@tileserp.com',
    password_hash: passwordHash,
    name: 'Super Admin',
  }).returning('*');

  await knex('profiles').insert({
    id: superAdminUser.id,
    name: 'Super Admin',
    email: 'admin@tileserp.com',
  });

  await knex('user_roles').insert({
    user_id: superAdminUser.id,
    role: 'super_admin',
  });

  // 2. Create a demo dealer
  const [dealer] = await knex('dealers').insert({
    name: 'Demo Tiles Store',
    phone: '01700000000',
    address: 'Demo Address, Dhaka',
  }).returning('*');

  // 3. Create a demo plan
  const [plan] = await knex('plans').insert({
    name: 'Basic',
    price_monthly: 500,
    price_yearly: 5000,
    max_users: 3,
  }).returning('*');

  // 4. Create subscription for demo dealer
  const endDate = new Date();
  endDate.setFullYear(endDate.getFullYear() + 1);

  await knex('subscriptions').insert({
    dealer_id: dealer.id,
    plan_id: plan.id,
    status: 'active',
    billing_cycle: 'yearly',
    start_date: new Date().toISOString().split('T')[0],
    end_date: endDate.toISOString().split('T')[0],
  });

  // 5. Create dealer admin user
  const [dealerAdmin] = await knex('users').insert({
    email: 'dealer@tileserp.com',
    password_hash: passwordHash,
    name: 'Demo Dealer Owner',
  }).returning('*');

  await knex('profiles').insert({
    id: dealerAdmin.id,
    name: 'Demo Dealer Owner',
    email: 'dealer@tileserp.com',
    dealer_id: dealer.id,
  });

  await knex('user_roles').insert({
    user_id: dealerAdmin.id,
    role: 'dealer_admin',
  });

  // 6. Create invoice sequence for dealer
  await knex('invoice_sequences').insert({
    dealer_id: dealer.id,
    next_invoice_no: 1,
    next_challan_no: 1,
  });

  console.log('Seed completed:');
  console.log('  Super Admin: admin@tileserp.com / admin123456');
  console.log('  Dealer Admin: dealer@tileserp.com / admin123456');
}
