import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── Enums ──
  await knex.raw(`
    DO $$ BEGIN
      CREATE TYPE app_role AS ENUM ('super_admin', 'dealer_admin', 'salesman');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE customer_type AS ENUM ('retailer', 'customer', 'project');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE ledger_entry_type AS ENUM ('sale','purchase','payment','refund','expense','receipt','adjustment');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE product_category AS ENUM ('tiles','sanitary');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE unit_type AS ENUM ('box_sft','piece');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE user_status AS ENUM ('active','inactive','suspended');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE subscription_status AS ENUM ('active','expired','suspended');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE payment_method_type AS ENUM ('cash','bank','mobile_banking');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;

    DO $$ BEGIN
      CREATE TYPE payment_status_type AS ENUM ('paid','partial','pending');
    EXCEPTION WHEN duplicate_object THEN NULL;
    END $$;
  `);

  // ── Users (replaces Supabase auth.users) ──
  await knex.schema.createTable('users', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('name', 255).notNullable();
    t.specificType('status', 'user_status').notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Refresh tokens ──
  await knex.schema.createTable('refresh_tokens', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.string('token_hash', 255).notNullable().unique();
    t.timestamp('expires_at', { useTz: true }).notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('user_id');
    t.index('token_hash');
  });

  // ── Dealers ──
  await knex.schema.createTable('dealers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('phone', 50);
    t.text('address');
    t.string('status', 20).notNullable().defaultTo('active');
    t.string('challan_template', 50).notNullable().defaultTo('classic');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Profiles (links users to dealers) ──
  await knex.schema.createTable('profiles', (t) => {
    t.uuid('id').primary().references('id').inTable('users').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('email', 255).notNullable();
    t.uuid('dealer_id').references('id').inTable('dealers').onDelete('SET NULL');
    t.specificType('status', 'user_status').notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── User roles ──
  await knex.schema.createTable('user_roles', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('user_id').notNullable().references('id').inTable('users').onDelete('CASCADE');
    t.specificType('role', 'app_role').notNullable();
    t.unique(['user_id', 'role']);
  });

  // ── Plans ──
  await knex.schema.createTable('plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();
    t.decimal('price_monthly', 12, 2).notNullable().defaultTo(0);
    t.decimal('price_yearly', 12, 2).notNullable().defaultTo(0);
    t.integer('max_users').notNullable().defaultTo(1);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Subscription plans (extended with feature flags) ──
  await knex.schema.createTable('subscription_plans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 100).notNullable();
    t.decimal('monthly_price', 12, 2).notNullable().defaultTo(0);
    t.decimal('yearly_price', 12, 2).notNullable().defaultTo(0);
    t.integer('max_users').notNullable().defaultTo(1);
    t.boolean('sms_enabled').notNullable().defaultTo(false);
    t.boolean('email_enabled').notNullable().defaultTo(false);
    t.boolean('daily_summary_enabled').notNullable().defaultTo(false);
    t.boolean('is_active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Subscriptions ──
  await knex.schema.createTable('subscriptions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('plan_id').notNullable().references('id').inTable('plans').onDelete('RESTRICT');
    t.specificType('status', 'subscription_status').notNullable().defaultTo('active');
    t.string('billing_cycle', 20).notNullable().defaultTo('monthly');
    t.date('start_date').notNullable().defaultTo(knex.fn.now());
    t.date('end_date');
    t.boolean('yearly_discount_applied').notNullable().defaultTo(false);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Subscription payments ──
  await knex.schema.createTable('subscription_payments', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('subscription_id').notNullable().references('id').inTable('subscriptions').onDelete('CASCADE');
    t.decimal('amount', 12, 2).notNullable().defaultTo(0);
    t.specificType('payment_method', 'payment_method_type').notNullable();
    t.specificType('payment_status', 'payment_status_type').notNullable().defaultTo('pending');
    t.date('payment_date').notNullable().defaultTo(knex.fn.now());
    t.string('note', 500);
    t.uuid('collected_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Customers ──
  await knex.schema.createTable('customers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.specificType('type', 'customer_type').notNullable().defaultTo('customer');
    t.string('phone', 50);
    t.string('email', 255);
    t.text('address');
    t.string('reference_name', 255);
    t.decimal('opening_balance', 14, 2).notNullable().defaultTo(0);
    t.decimal('credit_limit', 14, 2).notNullable().defaultTo(0);
    t.integer('max_overdue_days').notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Suppliers ──
  await knex.schema.createTable('suppliers', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('contact_person', 255);
    t.string('phone', 50);
    t.string('email', 255);
    t.text('address');
    t.string('gstin', 50);
    t.decimal('opening_balance', 14, 2).notNullable().defaultTo(0);
    t.string('status', 20).notNullable().defaultTo('active');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Products ──
  await knex.schema.createTable('products', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.string('name', 255).notNullable();
    t.string('sku', 100).notNullable();
    t.specificType('category', 'product_category').notNullable();
    t.specificType('unit_type', 'unit_type').notNullable().defaultTo('box_sft');
    t.decimal('per_box_sft', 10, 4);
    t.decimal('cost_price', 14, 2).notNullable().defaultTo(0);
    t.decimal('default_sale_rate', 14, 2).notNullable().defaultTo(0);
    t.string('size', 100);
    t.string('color', 100);
    t.string('brand', 100);
    t.string('material', 100);
    t.string('warranty', 100);
    t.string('weight', 100);
    t.string('barcode', 255);
    t.integer('reorder_level').notNullable().defaultTo(0);
    t.boolean('active').notNullable().defaultTo(true);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
    t.unique(['dealer_id', 'sku']);
  });

  // ── Stock ──
  await knex.schema.createTable('stock', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('CASCADE');
    t.decimal('box_qty', 14, 2).notNullable().defaultTo(0);
    t.decimal('sft_qty', 14, 2).notNullable().defaultTo(0);
    t.decimal('piece_qty', 14, 2).notNullable().defaultTo(0);
    t.decimal('reserved_box_qty', 14, 2).notNullable().defaultTo(0);
    t.decimal('reserved_piece_qty', 14, 2).notNullable().defaultTo(0);
    t.decimal('average_cost_per_unit', 14, 4).notNullable().defaultTo(0);
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.unique(['dealer_id', 'product_id']);
    t.index('dealer_id');
  });

  // ── Sales ──
  await knex.schema.createTable('sales', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('RESTRICT');
    t.string('invoice_number', 50);
    t.date('sale_date').notNullable().defaultTo(knex.fn.now());
    t.string('sale_type', 30).notNullable().defaultTo('direct_invoice');
    t.string('sale_status', 30).notNullable().defaultTo('invoiced');
    t.decimal('total_amount', 14, 2).notNullable().defaultTo(0);
    t.decimal('discount', 14, 2).notNullable().defaultTo(0);
    t.decimal('paid_amount', 14, 2).notNullable().defaultTo(0);
    t.decimal('due_amount', 14, 2).notNullable().defaultTo(0);
    t.decimal('cogs', 14, 2).notNullable().defaultTo(0);
    t.decimal('profit', 14, 2).notNullable().defaultTo(0);
    t.decimal('gross_profit', 14, 2).notNullable().defaultTo(0);
    t.decimal('net_profit', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_box', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_sft', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_piece', 14, 2).notNullable().defaultTo(0);
    t.string('payment_mode', 30);
    t.string('discount_reference', 255);
    t.string('client_reference', 255);
    t.string('fitter_reference', 255);
    t.text('notes');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
    t.index(['dealer_id', 'invoice_number']);
  });

  // ── Sale items ──
  await knex.schema.createTable('sale_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('sale_id').notNullable().references('id').inTable('sales').onDelete('CASCADE');
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('quantity', 14, 2).notNullable();
    t.decimal('sale_rate', 14, 2).notNullable();
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_sft', 14, 2);
    t.index('sale_id');
  });

  // ── Purchases ──
  await knex.schema.createTable('purchases', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('RESTRICT');
    t.string('invoice_number', 100);
    t.date('purchase_date').notNullable().defaultTo(knex.fn.now());
    t.decimal('total_amount', 14, 2).notNullable().defaultTo(0);
    t.text('notes');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Purchase items ──
  await knex.schema.createTable('purchase_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('purchase_id').notNullable().references('id').inTable('purchases').onDelete('CASCADE');
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('purchase_rate', 14, 2).notNullable();
    t.decimal('quantity', 14, 2).notNullable();
    t.decimal('total', 14, 2).notNullable().defaultTo(0);
    t.decimal('total_sft', 14, 2);
    t.decimal('transport_cost', 14, 2).notNullable().defaultTo(0);
    t.decimal('labor_cost', 14, 2).notNullable().defaultTo(0);
    t.decimal('other_cost', 14, 2).notNullable().defaultTo(0);
    t.decimal('landed_cost', 14, 2).notNullable().defaultTo(0);
    t.decimal('offer_price', 14, 2).notNullable().defaultTo(0);
    t.index('purchase_id');
  });

  // ── Challans ──
  await knex.schema.createTable('challans', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('sale_id').notNullable().references('id').inTable('sales').onDelete('CASCADE');
    t.string('challan_no', 50).notNullable();
    t.date('challan_date').notNullable().defaultTo(knex.fn.now());
    t.string('status', 30).notNullable().defaultTo('pending');
    t.string('delivery_status', 30).notNullable().defaultTo('pending');
    t.boolean('show_price').notNullable().defaultTo(false);
    t.string('driver_name', 255);
    t.string('transport_name', 255);
    t.string('vehicle_no', 100);
    t.text('notes');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Deliveries ──
  await knex.schema.createTable('deliveries', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('sale_id').references('id').inTable('sales').onDelete('SET NULL');
    t.uuid('challan_id').references('id').inTable('challans').onDelete('SET NULL');
    t.string('delivery_no', 50);
    t.date('delivery_date').notNullable().defaultTo(knex.fn.now());
    t.string('status', 30).defaultTo('pending');
    t.text('delivery_address');
    t.string('receiver_name', 255);
    t.string('receiver_phone', 50);
    t.text('notes');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Delivery items ──
  await knex.schema.createTable('delivery_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('delivery_id').notNullable().references('id').inTable('deliveries').onDelete('CASCADE');
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('sale_item_id').notNullable().references('id').inTable('sale_items').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('quantity', 14, 2).notNullable().defaultTo(0);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Customer ledger ──
  await knex.schema.createTable('customer_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.uuid('sale_id').references('id').inTable('sales').onDelete('SET NULL');
    t.uuid('sales_return_id');
    t.string('type', 30).notNullable();
    t.decimal('amount', 14, 2).notNullable();
    t.text('description');
    t.date('entry_date').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
    t.index('customer_id');
  });

  // ── Supplier ledger ──
  await knex.schema.createTable('supplier_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('CASCADE');
    t.uuid('purchase_id').references('id').inTable('purchases').onDelete('SET NULL');
    t.specificType('type', 'ledger_entry_type').notNullable();
    t.decimal('amount', 14, 2).notNullable();
    t.text('description');
    t.date('entry_date').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
    t.index('supplier_id');
  });

  // ── Cash ledger ──
  await knex.schema.createTable('cash_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.specificType('type', 'ledger_entry_type').notNullable();
    t.decimal('amount', 14, 2).notNullable();
    t.text('description');
    t.string('reference_type', 50);
    t.uuid('reference_id');
    t.date('entry_date').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Expense ledger ──
  await knex.schema.createTable('expense_ledger', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('expense_id');
    t.decimal('amount', 14, 2).notNullable();
    t.text('description');
    t.string('category', 100);
    t.date('entry_date').notNullable().defaultTo(knex.fn.now());
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Expenses ──
  await knex.schema.createTable('expenses', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.text('description').notNullable();
    t.decimal('amount', 14, 2).notNullable();
    t.string('category', 100);
    t.date('expense_date').notNullable().defaultTo(knex.fn.now());
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Sales returns ──
  await knex.schema.createTable('sales_returns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('sale_id').notNullable().references('id').inTable('sales').onDelete('RESTRICT');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('qty', 14, 2).notNullable();
    t.text('reason');
    t.date('return_date').notNullable().defaultTo(knex.fn.now());
    t.boolean('is_broken').notNullable().defaultTo(false);
    t.decimal('refund_amount', 14, 2).notNullable().defaultTo(0);
    t.string('refund_mode', 30);
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Purchase returns ──
  await knex.schema.createTable('purchase_returns', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('supplier_id').notNullable().references('id').inTable('suppliers').onDelete('RESTRICT');
    t.uuid('purchase_id').references('id').inTable('purchases').onDelete('SET NULL');
    t.string('return_no', 50).notNullable();
    t.date('return_date').notNullable().defaultTo(knex.fn.now());
    t.string('status', 30).defaultTo('completed');
    t.decimal('total_amount', 14, 2).defaultTo(0);
    t.text('notes');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Purchase return items ──
  await knex.schema.createTable('purchase_return_items', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('purchase_return_id').notNullable().references('id').inTable('purchase_returns').onDelete('CASCADE');
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('product_id').notNullable().references('id').inTable('products').onDelete('RESTRICT');
    t.decimal('quantity', 14, 2).defaultTo(0);
    t.decimal('unit_price', 14, 2).notNullable();
    t.decimal('total', 14, 2).notNullable();
    t.text('reason');
  });

  // ── Invoice sequences ──
  await knex.schema.createTable('invoice_sequences', (t) => {
    t.uuid('dealer_id').primary().references('id').inTable('dealers').onDelete('CASCADE');
    t.integer('next_invoice_no').notNullable().defaultTo(1);
    t.integer('next_challan_no').notNullable().defaultTo(1);
  });

  // ── Credit overrides ──
  await knex.schema.createTable('credit_overrides', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.uuid('sale_id').references('id').inTable('sales').onDelete('SET NULL');
    t.decimal('credit_limit_at_time', 14, 2).notNullable().defaultTo(0);
    t.decimal('outstanding_at_time', 14, 2).notNullable().defaultTo(0);
    t.decimal('new_due_at_time', 14, 2).notNullable().defaultTo(0);
    t.uuid('overridden_by');
    t.text('override_reason').notNullable();
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Customer follow-ups ──
  await knex.schema.createTable('customer_followups', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.text('note').notNullable();
    t.date('followup_date').notNullable().defaultTo(knex.fn.now());
    t.string('status', 30).notNullable().defaultTo('pending');
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Campaign gifts ──
  await knex.schema.createTable('campaign_gifts', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.uuid('customer_id').notNullable().references('id').inTable('customers').onDelete('CASCADE');
    t.string('campaign_name', 255).notNullable();
    t.text('description');
    t.decimal('gift_value', 14, 2).notNullable().defaultTo(0);
    t.string('payment_status', 30).notNullable().defaultTo('pending');
    t.decimal('paid_amount', 14, 2).notNullable().defaultTo(0);
    t.uuid('created_by');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Notification settings ──
  await knex.schema.createTable('notification_settings', (t) => {
    t.uuid('dealer_id').primary().references('id').inTable('dealers').onDelete('CASCADE');
    t.boolean('enable_sale_sms').notNullable().defaultTo(true);
    t.boolean('enable_sale_email').notNullable().defaultTo(true);
    t.boolean('enable_daily_summary_sms').notNullable().defaultTo(true);
    t.boolean('enable_daily_summary_email').notNullable().defaultTo(true);
    t.string('owner_phone', 50);
    t.string('owner_email', 255);
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Notifications ──
  await knex.schema.createTable('notifications', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id').notNullable().references('id').inTable('dealers').onDelete('CASCADE');
    t.string('channel', 20).notNullable();
    t.string('type', 50).notNullable();
    t.jsonb('payload').notNullable().defaultTo('{}');
    t.string('status', 20).notNullable().defaultTo('pending');
    t.text('error_message');
    t.integer('retry_count').notNullable().defaultTo(0);
    t.timestamp('sent_at', { useTz: true });
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Audit logs ──
  await knex.schema.createTable('audit_logs', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.uuid('dealer_id');
    t.uuid('user_id');
    t.string('action', 100).notNullable();
    t.string('table_name', 100).notNullable();
    t.uuid('record_id');
    t.jsonb('old_data');
    t.jsonb('new_data');
    t.string('ip_address', 50);
    t.text('user_agent');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index('dealer_id');
  });

  // ── Contact submissions ──
  await knex.schema.createTable('contact_submissions', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('name', 255).notNullable();
    t.string('business_name', 255);
    t.string('phone', 50);
    t.string('email', 255).notNullable();
    t.text('message').notNullable();
    t.string('status', 20).notNullable().defaultTo('new');
    t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── Website content (CMS) ──
  await knex.schema.createTable('website_content', (t) => {
    t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
    t.string('section_key', 100).notNullable().unique();
    t.string('title', 500);
    t.string('subtitle', 500);
    t.text('description');
    t.string('button_text', 100);
    t.string('button_link', 500);
    t.jsonb('extra_json');
    t.timestamp('updated_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
  });

  // ── DB functions for invoice/challan sequences ──
  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_next_invoice_no(_dealer_id uuid)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE _next integer;
    BEGIN
      INSERT INTO invoice_sequences (dealer_id, next_invoice_no)
      VALUES (_dealer_id, 2)
      ON CONFLICT (dealer_id) DO UPDATE
        SET next_invoice_no = invoice_sequences.next_invoice_no + 1
      RETURNING next_invoice_no - 1 INTO _next;
      RETURN 'INV-' || lpad(_next::text, 5, '0');
    END;
    $$;

    CREATE OR REPLACE FUNCTION generate_next_challan_no(_dealer_id uuid)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE _next integer;
    BEGIN
      INSERT INTO invoice_sequences (dealer_id, next_challan_no)
      VALUES (_dealer_id, 2)
      ON CONFLICT (dealer_id) DO UPDATE
        SET next_challan_no = invoice_sequences.next_challan_no + 1
      RETURNING next_challan_no - 1 INTO _next;
      RETURN 'CH-' || lpad(_next::text, 5, '0');
    END;
    $$;
  `);
}

export async function down(knex: Knex): Promise<void> {
  const tables = [
    'website_content', 'contact_submissions', 'audit_logs', 'notifications',
    'notification_settings', 'campaign_gifts', 'customer_followups',
    'credit_overrides', 'invoice_sequences', 'purchase_return_items',
    'purchase_returns', 'sales_returns', 'expense_ledger', 'expenses',
    'cash_ledger', 'supplier_ledger', 'customer_ledger', 'delivery_items',
    'deliveries', 'challans', 'purchase_items', 'purchases', 'sale_items',
    'sales', 'stock', 'products', 'suppliers', 'customers',
    'subscription_payments', 'subscriptions', 'subscription_plans', 'plans',
    'user_roles', 'profiles', 'refresh_tokens', 'users', 'dealers',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }

  await knex.raw(`
    DROP FUNCTION IF EXISTS generate_next_invoice_no(uuid);
    DROP FUNCTION IF EXISTS generate_next_challan_no(uuid);
    DROP TYPE IF EXISTS payment_status_type;
    DROP TYPE IF EXISTS payment_method_type;
    DROP TYPE IF EXISTS subscription_status;
    DROP TYPE IF EXISTS user_status;
    DROP TYPE IF EXISTS unit_type;
    DROP TYPE IF EXISTS product_category;
    DROP TYPE IF EXISTS ledger_entry_type;
    DROP TYPE IF EXISTS customer_type;
    DROP TYPE IF EXISTS app_role;
  `);
}
