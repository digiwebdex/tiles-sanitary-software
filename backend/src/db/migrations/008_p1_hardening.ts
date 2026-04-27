/**
 * P1 hardening migration.
 *
 * Closes audit findings:
 *   - Sequence concurrency: rewrite generate_next_invoice_no /
 *     generate_next_challan_no / generate_next_quotation_no with explicit
 *     SELECT ... FOR UPDATE so concurrent inserts cannot collide on the
 *     same dealer row.
 *   - Delivery/batch integrity: add a unique (delivery_item_id, batch_id)
 *     constraint on delivery_item_batches so duplicate allocations from a
 *     re-run of execute_delivery_batches are physically impossible.
 *   - Idempotency: add idempotency_key to whatsapp_message_logs and a new
 *     sms_message_logs table so retried/double-clicked send actions cannot
 *     produce duplicate sends.
 *
 * This migration is idempotent and safe to run multiple times — every
 * statement is guarded with IF NOT EXISTS / CREATE OR REPLACE.
 */
import type { Knex } from 'knex';

export async function up(knex: Knex): Promise<void> {
  // ── 1. Concurrency-safe sequence functions ─────────────────────────────
  // Pattern: row-locking SELECT FOR UPDATE inside a transaction-safe
  // PL/pgSQL block. ON CONFLICT DO UPDATE on Postgres already provides
  // atomic increment semantics, but FOR UPDATE on the existing row is
  // more defensive against any future trigger / read-modify-write code
  // that might be layered on top.
  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_next_invoice_no(_dealer_id uuid)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE _next integer;
    BEGIN
      -- Ensure the row exists, then lock it.
      INSERT INTO invoice_sequences (dealer_id, next_invoice_no)
      VALUES (_dealer_id, 1)
      ON CONFLICT (dealer_id) DO NOTHING;

      PERFORM 1 FROM invoice_sequences
        WHERE dealer_id = _dealer_id FOR UPDATE;

      UPDATE invoice_sequences
        SET next_invoice_no = next_invoice_no + 1
        WHERE dealer_id = _dealer_id
        RETURNING next_invoice_no - 1 INTO _next;

      RETURN 'INV-' || lpad(_next::text, 5, '0');
    END;
    $$;
  `);

  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_next_challan_no(_dealer_id uuid)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE _next integer;
    BEGIN
      INSERT INTO invoice_sequences (dealer_id, next_challan_no)
      VALUES (_dealer_id, 1)
      ON CONFLICT (dealer_id) DO NOTHING;

      PERFORM 1 FROM invoice_sequences
        WHERE dealer_id = _dealer_id FOR UPDATE;

      UPDATE invoice_sequences
        SET next_challan_no = next_challan_no + 1
        WHERE dealer_id = _dealer_id
        RETURNING next_challan_no - 1 INTO _next;

      RETURN 'CH-' || lpad(_next::text, 5, '0');
    END;
    $$;
  `);

  // Quotation sequence may not exist on every install — guard the column.
  const hasQuoCol = await knex.schema.hasColumn('invoice_sequences', 'next_quotation_no');
  if (!hasQuoCol) {
    await knex.schema.alterTable('invoice_sequences', (t) => {
      t.integer('next_quotation_no').notNullable().defaultTo(1);
    });
  }

  await knex.raw(`
    CREATE OR REPLACE FUNCTION generate_next_quotation_no(_dealer_id uuid)
    RETURNS text LANGUAGE plpgsql AS $$
    DECLARE _next integer;
    BEGIN
      INSERT INTO invoice_sequences (dealer_id, next_quotation_no)
      VALUES (_dealer_id, 1)
      ON CONFLICT (dealer_id) DO NOTHING;

      PERFORM 1 FROM invoice_sequences
        WHERE dealer_id = _dealer_id FOR UPDATE;

      UPDATE invoice_sequences
        SET next_quotation_no = next_quotation_no + 1
        WHERE dealer_id = _dealer_id
        RETURNING next_quotation_no - 1 INTO _next;

      RETURN 'Q-' || lpad(_next::text, 5, '0');
    END;
    $$;
  `);

  // ── 2. Delivery / batch integrity ──────────────────────────────────────
  // Only enforce on tables that actually exist on the VPS instance.
  const hasDib = await knex.schema.hasTable('delivery_item_batches');
  if (hasDib) {
    await knex.raw(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes
          WHERE schemaname = 'public'
            AND indexname = 'uniq_delivery_item_batch'
        ) THEN
          CREATE UNIQUE INDEX uniq_delivery_item_batch
            ON delivery_item_batches (delivery_item_id, batch_id);
        END IF;
      END $$;
    `);
  }

  // ── 3. Idempotency: WhatsApp / SMS send logs ──────────────────────────
  const hasWhatsapp = await knex.schema.hasTable('whatsapp_message_logs');
  if (hasWhatsapp) {
    const hasIdemCol = await knex.schema.hasColumn('whatsapp_message_logs', 'idempotency_key');
    if (!hasIdemCol) {
      await knex.schema.alterTable('whatsapp_message_logs', (t) => {
        t.string('idempotency_key', 80).nullable();
      });
    }
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_whatsapp_idem
        ON whatsapp_message_logs (dealer_id, idempotency_key)
        WHERE idempotency_key IS NOT NULL;
    `);
  }

  // sms_message_logs is a new lightweight table — used for tracking
  // dealer SMS sends with idempotency. notification_log already exists
  // for system-wide notifications; this is dealer-action specific.
  const hasSmsLog = await knex.schema.hasTable('sms_message_logs');
  if (!hasSmsLog) {
    await knex.schema.createTable('sms_message_logs', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('dealer_id').notNullable();
      t.string('idempotency_key', 80).notNullable();
      t.string('to_phone', 32).notNullable();
      t.text('message').notNullable();
      t.string('status', 20).notNullable().defaultTo('queued'); // queued|sent|failed
      t.string('source_type', 40).nullable();   // 'sale' | 'payment_receipt' | 'quotation' | ...
      t.uuid('source_id').nullable();
      t.text('provider_response').nullable();
      t.timestamp('sent_at', { useTz: true }).nullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`
      CREATE UNIQUE INDEX IF NOT EXISTS uniq_sms_idem
        ON sms_message_logs (dealer_id, idempotency_key);
    `);
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_sms_logs_dealer_created
        ON sms_message_logs (dealer_id, created_at DESC);
    `);
  }

  // ── 4. Server-side audit log table ──────────────────────────────────────
  // Already exists in Supabase; mirror it on VPS for the new
  // /api/audit-logs endpoint. We do NOT touch existing columns.
  const hasAudit = await knex.schema.hasTable('audit_logs');
  if (!hasAudit) {
    await knex.schema.createTable('audit_logs', (t) => {
      t.uuid('id').primary().defaultTo(knex.raw('gen_random_uuid()'));
      t.uuid('dealer_id').nullable();
      t.uuid('user_id').nullable();
      t.string('action', 80).notNullable();
      t.string('table_name', 80).notNullable();
      t.uuid('record_id').nullable();
      t.jsonb('old_data').nullable();
      t.jsonb('new_data').nullable();
      t.string('ip_address', 64).nullable();
      t.text('user_agent').nullable();
      t.timestamp('created_at', { useTz: true }).notNullable().defaultTo(knex.fn.now());
    });
    await knex.raw(`
      CREATE INDEX IF NOT EXISTS idx_audit_dealer_created
        ON audit_logs (dealer_id, created_at DESC);
    `);
  }
}

export async function down(_knex: Knex): Promise<void> {
  // No-op: this migration is purely additive (new constraints + columns).
  // Rolling back unique indexes on a live system would re-introduce risk.
}
