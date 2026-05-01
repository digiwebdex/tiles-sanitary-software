---
name: VPS Migration Phase 3U-28
description: notificationService fully migrated to VPS via /api/notifications/dispatch + /settings; edge fn retired
type: feature
---

# Phase 3U-28 — notificationService cutover to VPS

**Goal:** Remove the last business-logic dependency on the Supabase `send-notification` edge function. All sale / daily-summary / payment-reminder dispatch now flows through the VPS backend.

## Scope

### Backend (new)
- `POST /api/notifications/dispatch` — mirrors the old edge fn:
  - Inserts a `notifications` row (`status='pending'`)
  - Plan-gates against `subscription_plans.{sms_enabled, email_enabled, daily_summary_enabled}` for the dealer's active subscription
  - Renders templates for `sale_created`, `daily_summary`, `payment_reminder` (or honors `payload._custom_message`)
  - Dispatches via existing `sendSms` (BulkSMSBD) / `sendEmail` (SMTP/nodemailer)
  - Updates the row to `sent` / `failed` with `sent_at` + `error_message`
  - Best-effort: never throws to caller; returns `{success, id, error}`
- `GET /api/notifications/settings` — returns the dealer's `notification_settings` row (or `null`)
- Both gated by `requireDealer` + `requireRole('dealer_admin','salesman')`

### Frontend
`src/services/notificationService.ts` rewritten:
- Zero Supabase imports
- `getSettings()` → `vpsAuthedFetch('/api/notifications/settings')`
- `dispatch()` helper → `POST /api/notifications/dispatch`
- Public API unchanged: `notifySaleCreated`, `notifyDailySummary`, `sendPaymentReminder`
- Still fire-and-forget; sales/collections never block on notifications
- `dealerId` parameter retained for API stability but unused (the VPS endpoint derives it from JWT)

### DB migration
Relaxed `notifications_type_check` to allow `'payment_reminder'` (previously only `sale_created` / `daily_summary`). This means reminder sends from CollectionTracker are now properly audited in the `notifications` table — they were silently failing the queue-insert before (the catch swallowed it; SMS was still firing).

## Intentionally retained on Supabase
- `supabase/functions/send-notification` — kept deployed but unused; safe rollback if VPS dispatch has issues. Can be deleted in a future cleanup.
- `supabase/functions/daily-summary-cron` — still triggers nightly via pg_cron and calls `notifyDailySummary` server-side, which now hits VPS via service-role JWT (no change needed there).

## Files
- `backend/src/routes/notifications.ts` — added `/dispatch` + `/settings` endpoints (~210 new lines)
- `src/services/notificationService.ts` — full rewrite (239 → 195 lines, no Supabase)
- DB migration: `notifications_type_check` includes `payment_reminder`

## Deployment
Backend rebuild + PM2 restart required:
```
cd /var/www/tilessaas/backend && git pull && npm install && npm run build && pm2 restart tilessaas-backend
```
