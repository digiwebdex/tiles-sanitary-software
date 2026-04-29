# Full Supabase → VPS Postgres Migration Plan

**Goal:** সম্পূর্ণ application Supabase থেকে self-hosted VPS Postgres + Express backend-এ migrate।
**Strategy:** Module-by-module incremental cutover (Phase 1/2 অলরেডি done — Auth + Dashboard + Products)।
**Old Supabase:** কয়েক মাস read-only fallback হিসেবে রাখা হবে।

---

## Phase 3 — Module Cutover (এই plan-এর focus)

প্রতিটা module-এর জন্য 4 ধাপ:
1. Backend route তৈরি (`backend/src/routes/<module>.ts`) + Zod validation + dealer scoping
2. Backend deploy + smoke test (`curl /api/<module>`)
3. Frontend service rewire — সব Supabase call → `vpsAuthedFetch` / `dataClient`
4. VPS `.env`-এ `VITE_DATA_<MODULE>=vps` flag, frontend rebuild

### Module priority order (dependency-aware)

| # | Module | Backend route | Frontend service | Status |
|---|--------|--------------|------------------|--------|
| 1 | Customers | ✅ আছে | ⚠ partial (writes Supabase) | **এই session** |
| 2 | Suppliers | ✅ আছে | ⚠ partial | **এই session** |
| 3 | Customer Ledger | ❌ | ❌ | next |
| 4 | Supplier Ledger | ❌ | ❌ | next |
| 5 | Stock | ✅ আছে | ⚠ verify | next |
| 6 | Batches | ✅ আছে | ⚠ verify | next |
| 7 | Sales + Sale Items | ❌ | ❌ | week 2 |
| 8 | Sale Invoice numbering RPC | ❌ (port `generate_next_invoice_no`) | — | week 2 |
| 9 | Allocate/Restore sale batches RPCs | ❌ (port `allocate_sale_batches`, `restore_sale_batches`) | — | week 2 |
| 10 | Backorder allocation engine | ❌ | ❌ | week 2 |
| 11 | Stock Reservations RPCs | ❌ (4 PL/pgSQL functions) | ❌ | week 3 |
| 12 | Purchases + Purchase Items | ❌ | ❌ | week 3 |
| 13 | Purchase Returns | ❌ | ❌ | week 3 |
| 14 | Sales Returns | ❌ | ❌ | week 3 |
| 15 | Deliveries + Challans + Challan numbering RPC | ❌ | ❌ | week 4 |
| 16 | `execute_delivery_batches` RPC port | ❌ | — | week 4 |
| 17 | Quotations + Quotation Items + revision RPC | ❌ | ❌ | week 4 |
| 18 | Approvals (decide/consume/cancel/expire RPCs) | ❌ | ❌ | week 5 |
| 19 | Payments | ❌ | ❌ | week 5 |
| 20 | Reports — sales, inventory, projects, suppliers | ❌ | ❌ | week 5 |
| 21 | Campaign gifts | ❌ | ❌ | week 6 |
| 22 | Projects + Sites | ❌ | ❌ | week 6 |
| 23 | Pricing Tiers | ❌ | ❌ | week 6 |
| 24 | Demand Planning + Display Stock + Supplier Performance/Notes | ❌ | ❌ | week 6 |
| 25 | Audit Logs view (already write-side via VPS-friendly trigger) | partial | ❌ | week 7 |
| 26 | Subscription payment tracking (Super Admin) | ⚠ partial | ⚠ | week 7 |
| 27 | Portal (customer-facing) — separate auth + 5 portal RPCs | ❌ | ❌ | week 7 |
| 28 | WhatsApp logs/settings + send | ❌ | ❌ | week 8 |
| 29 | CMS (`website_content`) | ❌ public read endpoint | ❌ | week 8 |

### Edge functions → Express endpoints

| Edge function | New Express endpoint | Notes |
|---|---|---|
| `self-signup` | `POST /api/auth/signup` | dealer + admin user + role + trial sub atomically |
| `create-dealer-user` | `POST /api/super/dealers/users` | super_admin only |
| `delete-dealer` | `DELETE /api/super/dealers/:id` | cascades |
| `reset-dealer-password` | `POST /api/super/dealers/:id/reset-password` | |
| `invite-portal-user` | `POST /api/portal-users/invite` | |
| `seed-demo-dealer` | `POST /api/super/seed-demo` | |
| `submit-contact` | `POST /api/contact` | landing-page form |
| `send-notification` | already on VPS via `notificationService.ts` | verify |
| `daily-summary` | already on VPS — keep cron via pg_cron OR node-cron | |
| `check-subscription-status` | merge into existing `/api/subscription-status` | |
| `backup-manager` | rclone via shell script + `/api/backups/*` | already mostly VPS |
| `ai-chat` | `POST /api/ai-chat` (proxy to Lovable AI Gateway) | |
| `test-smtp` | `POST /api/super/test-smtp` | |

### Storage migration
- Supabase Storage buckets → VPS local disk under `/var/www/tilessaas/uploads/`
- Already exists: `backend/src/routes/uploads.ts`
- Remaining: migrate existing files (one-time `rclone` from Supabase Storage to VPS)

### Realtime
- Currently used for: messages-style streams (memory mentions)
- Replacement: Server-Sent Events or skip (most ERP screens don't need it)

---

## Data migration (one-time)

When Phase 3 complete:
1. `pg_dump` from Supabase (data only, public schema): `pg_dump -h db.<ref>.supabase.co -U postgres --data-only --schema=public -Fc -f supabase.dump`
2. Pre-checks on VPS: drop FK constraints temporarily, truncate target tables in topological order
3. `pg_restore --data-only --disable-triggers -d tileserp supabase.dump`
4. Re-enable triggers, validate row counts per table per dealer_id
5. Sequence resets: `SELECT setval('<seq>', max(id)) FROM <table>`
6. Auth user mapping: Supabase `auth.users` rows → VPS `users` table (bcrypt rehash impossible → password reset email to all dealers OR import as locked accounts)

---

## Cleanup phase (months later, after observation period)

- Remove `src/integrations/supabase/client.ts` imports module by module
- Delete `supabase/functions/*` once all replaced
- Drop `supabaseAdapter.ts` and `shadowAdapter.ts`
- Remove `VITE_SUPABASE_*` env vars
- Pause Supabase project (don't delete yet — keep as cold archive)

---

## Risk register

| Risk | Mitigation |
|---|---|
| Live dealers lose data mid-migration | Module flags allow rollback per-module via env unset |
| RLS-equivalent missing on VPS | Every route enforces `dealer_id = req.dealerId` in `where` clauses + role middleware |
| Atomic operations (sale + ledger + stock) lose transactional guarantee | All multi-table writes use `db.transaction(async trx => ...)` |
| 50+ PL/pgSQL functions to port | Group by feature, port to TypeScript service layer with `db.transaction` |
| Auth migration breaks logins | Phase 1 already done — VPS auth proven on app.sanitileserp.com |
| Backups lost during cutover | Daily rclone to Google Drive already running on VPS |

---

## Current session (Customers + Suppliers writes)

1. ✅ Backend routes verified (`POST/PATCH/DELETE /api/customers` + `/api/suppliers` exist)
2. Rewire `customerService.ts` create/update/toggleStatus to use `vpsAuthedFetch`
3. Rewire `supplierService.ts` create/update/toggleStatus to use `vpsAuthedFetch`
4. Add `getDueBalance` VPS-aware fallback (or keep Supabase short-term — lacks ledger endpoint)
5. After deploy: VPS `.env` add `VITE_DATA_CUSTOMERS=vps` and `VITE_DATA_SUPPLIERS=vps`, rebuild
