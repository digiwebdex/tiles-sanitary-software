---
name: VPS Migration Phase 3J-2
description: Pricing tier, Project, Supplier performance reports on VPS via /api/reports/{pricing-tier,projects,supplier-performance}/*
type: feature
---
# Phase 3J-2 — Specialized Reports on VPS

## Scope (reads only)
- Pricing tier reports → `/api/reports/pricing-tier/{tiers,customers,sales,quoted,manual-overrides,dashboard}`
- Project reports → `/api/reports/projects/{sales,outstanding,delivery-history,quotation-pipeline,top-active,site-summary,site-history,dashboard}`
- Supplier performance → `/api/reports/supplier-performance` (list), `/dashboard`, `/:id`, `/:id/price-trend`

## Backend files
- `backend/src/routes/pricingTierReports.ts`
- `backend/src/routes/projectReports.ts`
- `backend/src/routes/supplierPerformanceReports.ts`
- Mounted in `backend/src/index.ts` (after `/api/reports`).

## Frontend
- `pricingTierReportService`, `projectReportService`, `supplierPerformanceService` short-circuit to VPS when `env.AUTH_BACKEND === "vps"`.
- Supabase fallback retained for non-VPS environments.

## Security
- All routes: `authenticate + tenantGuard` + `requireFinancialRole` (dealer_admin/super_admin only). Salesman gets 403.
- Dealer scoping via `req.dealerId`; super_admin must pass `dealerId` query.

## FIFO/derived logic
- Supplier reliability score, price-trend (volume-weighted drift), cadence (median × 1.5 + 7d floor) all server-side.
- Project overdue calc uses `customers.max_overdue_days`.

## Notes
- Order in index.ts: `app.use('/api/reports', reportsRoutes)` before sub-mounts; Express falls through to specific routers when reportsRoutes does not match.
- Mutations (none in scope) still on Supabase for these read-only services.
