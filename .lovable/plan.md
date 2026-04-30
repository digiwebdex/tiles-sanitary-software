## Problem

You're receiving daily Bengali SMS reports addressed to "Shamin" on `+8801674533303`. Investigation shows:

- "Shamin" **does exist** in the database as a dealer (id `2b73d124-…`, status `active`, subscription valid until 2026-05-27, created 2026-04-25). It's the only dealer in the DB right now — likely a stray self-signup / test account you don't recognize.
- The `daily-summary` Supabase edge function fetches dealers by reading `notification_settings` directly. It does **not** check `dealers.status` or whether the dealer has an `active` subscription — so any row in `notification_settings` with the SMS/email toggle on gets a daily blast, even if the dealer is pending, suspended, or has an expired subscription.

## Fix (two parts)

### 1. Remove the orphan dealer
Migration that fully deletes dealer `Shamin` and all its dependent data (notifications, settings, subscriptions, ledgers, etc.) from the database. Most child tables already have `ON DELETE CASCADE` from earlier migrations; the migration will explicitly delete from `notification_settings`, `subscriptions`, `subscription_payments`, and finally from `dealers` to be safe.

### 2. Gate the daily-summary cron to genuinely active dealers
Update `supabase/functions/daily-summary/index.ts` so it only sends to dealers that satisfy **all** of:

- `dealers.status = 'active'`
- An active subscription row exists (`subscriptions.status = 'active'` AND `subscriptions.end_date >= today`)
- `notification_settings.enable_daily_summary_sms` (or email) is true
- `owner_phone` (or `owner_email`) is non-empty

Implementation: replace the current `notification_settings`-only query with a join on `dealers` + `subscriptions`. Pending/suspended/expired dealers are silently skipped and logged.

### Technical details

**Files**
- New migration `supabase/migrations/<ts>_remove_shamin_and_gate_summary.sql`:
  ```sql
  DELETE FROM notification_settings WHERE dealer_id = '2b73d124-1b28-4f1e-8648-738aebc610cb';
  DELETE FROM subscription_payments WHERE dealer_id = '2b73d124-1b28-4f1e-8648-738aebc610cb';
  DELETE FROM subscriptions         WHERE dealer_id = '2b73d124-1b28-4f1e-8648-738aebc610cb';
  DELETE FROM dealers               WHERE id        = '2b73d124-1b28-4f1e-8648-738aebc610cb';
  ```
  (Cascades will clean up profiles, products, sales, ledgers, audit logs, etc.)

- Edit `supabase/functions/daily-summary/index.ts`:
  - Replace step 1 query with one that joins `notification_settings` → `dealers` → `subscriptions`, filtering on `dealers.status = 'active'` and an active, non-expired subscription.
  - Skip + log any dealer that fails the gate.

**No frontend changes** required.

## Verification after deploy

1. Run a one-off DB check: `SELECT count(*) FROM dealers;` → should be 0.
2. Manually invoke the `daily-summary` edge function — should report `processed: 0` and exit cleanly.
3. Tomorrow night's cron run will produce no SMS until a real, active, paid dealer exists.
