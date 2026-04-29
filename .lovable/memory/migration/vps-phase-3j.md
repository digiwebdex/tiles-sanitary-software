---
name: VPS Migration Phase 3J
description: Reports module (10 reports in reportService.ts) on VPS via /api/reports/*; pricing-tier/project/supplier-performance reports tracked as 3J-extras
type: feature
---
# Phase 3J — Reports module on VPS

**Scope:** all 10 functions in `src/services/reportService.ts` now go
through `/api/reports/*` on the VPS when `AUTH_BACKEND === "vps"`.

**Backend route** (`backend/src/routes/reports.ts`, ~580 lines):
- `GET /api/reports/stock` — SKU-wise stock + valuation
- `GET /api/reports/products` — purchase/sale/profit/stock per product
- `GET /api/reports/brand-stock` — brand-aggregated stock & sales
- `GET /api/reports/sales` — daily/monthly sales buckets
- `GET /api/reports/retailer-sales` — yearly customer sales (filterable by type)
- `GET /api/reports/product-history` — purchase + sale + return timeline
- `GET /api/reports/customer-due` — receivables list, paginated
- `GET /api/reports/supplier-payable` — payables list, paginated
- `GET /api/reports/accounting-summary` — yearly per-month P&L summary
- `GET /api/reports/inventory-aging` — FIFO-based valuation + aging buckets
- `GET /api/reports/low-stock` — products at/under reorder level

**Security:**
- `tenantGuard` + explicit `dealer_id` on every query.
- Salesman role gets 403 on all financial reports
  (cost / margin / profit / receivables); only `low-stock` is open to them.
- super_admin must pass `dealerId` query param explicitly.

**Frontend** (`src/services/reportService.ts`): every `fetch*` function now
short-circuits to `vpsRequest(...)` when on VPS. Legacy Supabase paths
retained as fallback for preview/non-VPS hosts (except `inventory-aging`,
which is VPS-only because the FIFO walk is too heavy for client-side).

**Why VPS canonical:**
- Reports do heavy aggregation (FIFO walk, multi-table joins) — server
  execution is faster + safer than 5-7 round trips through PostgREST.
- Salesman cost-strip is now enforced server-side, eliminating a class
  of client-bypass risk.

**Deploy:**
```
cd /var/www/tilessaas && git pull && \
  cd backend && npm install && pm2 restart tileserp-api && \
  cd .. && npm run build
```

**3J-extras (next):** `pricingTierReportService` (5 reports),
`projectReportService` (7 reports + dashboard stats),
`supplierPerformanceService` (~6 aggregations). These three services
were intentionally split off because each is an independent ~500-line
file with its own table joins; bundling them into one Knex route file
would have produced 1500+ extra lines in this single response. They'll
land as Phase 3J-2 next.
