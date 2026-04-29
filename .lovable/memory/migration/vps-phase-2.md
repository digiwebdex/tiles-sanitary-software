---
name: VPS Migration Phase 2 — Dashboard data path
description: Phase 2 starts moving read aggregations from Supabase to VPS. First endpoint live: GET /api/dashboard
type: feature
---

Phase 1 = auth on VPS. Phase 2 = data on VPS, one resource at a time.

## What is live

- Backend route `backend/src/routes/dashboard.ts` mounted at `/api/dashboard`.
  - Auth: `authenticate` + `tenantGuard`. Salesman allowed (frontend hides KPIs).
  - Returns full `DashboardData` shape (today/monthly sales, profit, collection,
    monthly purchase, customer due, supplier payable, total stock value,
    low-stock items, monthly chart, category sales, top customers,
    product performance).
  - `cashInHand`, `creditExceededCount`, `deadStockCount` left at 0 until
    Phase 2.1 (cash_ledger + credit_limits + 90-day no-sale aggregations).
- Frontend `src/services/dashboardService.ts`:
  - When `env.AUTH_BACKEND === "vps"` (true on `*.sanitileserp.com`),
    calls `vpsAuthedFetch("/api/dashboard?dealerId=...")` and merges with
    `SAFE_DEFAULTS`. **No Supabase fallback** — fallback would re-introduce
    the empty-dashboard bug for live dealers.
  - Supabase code path remains for dev/legacy hosts only.

## Why this matters

After Phase 1 went live, login worked but dashboard was empty because
products/sales/payments services still queried Supabase. Live dealers saw
all-zero KPIs. Phase 2 fixes the dashboard read first because that's the
loudest visible bug.

## Next (Phase 2.1)

Still on Supabase, must move next:
- `productService.ts`, `stockService.ts`, `salesService.ts`,
  `purchaseService.ts`, `paymentService.ts`
- New backend routes: `sales.ts`, `payments.ts`, `purchases.ts`,
  `stockAdjust.ts`, `cashLedger.ts`
- One-time data migration script Supabase → VPS Postgres for existing dealers.

## Deploy

See `deploy/RUNBOOK.md` §10. Standard cycle:
`git pull && bun install && bun run build && pm2 restart tilessaas-backend --update-env`.
