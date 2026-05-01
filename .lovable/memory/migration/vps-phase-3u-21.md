---
name: VPS Migration Phase 3U-21
description: backorderAllocationService reads on VPS via /api/backorders/*; stockService and batchService confirmed dead-code under VPS (only legacy salesService callers)
type: feature
---
Phase 3U-21: 

**backorderAllocationService.ts** (401 → 117 lines):
- Removed all Supabase calls and dead write helpers (`allocateNewStock`, `releaseAllocations`, `updateSaleBackorderFlag`) — already covered atomically server-side by Phase 3K (purchases), 3L (sales create), 3M (sales update/cancel), 3N (returns).
- Migrated 7 read endpoints to VPS:
  - `getBackorderSummary` → GET /api/backorders/summary
  - `getPendingFulfillment` → GET /api/backorders/pending
  - `getShortageDemandReport` → GET /api/backorders/shortage-demand
  - `getReadyForDelivery` → GET /api/backorders/ready-for-delivery
  - `getPartiallyDelivered` → GET /api/backorders/partially-delivered
  - `getOldestPending` → GET /api/backorders/oldest-pending
  - `getDashboardStats` → GET /api/backorders/dashboard-stats
  - `getSaleFulfillmentSummary` → GET /api/backorders/sale/:saleId
- Live consumers: `BackorderReports.tsx` (6 queries), `OwnerDashboard.tsx` (1 query).

**stockService.ts**: Audit complete — `reserveStock`/`unreserveStock`/`deductReservedStock` only callers are legacy `salesService.ts` cancel path (dead under VPS) + tests. Will clean alongside 3U-22.

**batchService.ts**: Audit complete — all 9 method calls live inside `salesService.ts` legacy create/update/cancel branches (dead under VPS). Will clean alongside 3U-22.

**New backend route**: `backend/src/routes/backorders.ts` (~340 lines, 8 read endpoints), mounted at `/api/backorders`. Uses Knex, dealer-scoped via `tenantGuard`. Includes complex aggregations (shortage-demand, oldest-pending, dashboard-stats) that match frontend logic exactly.

**Files changed**:
- backend/src/routes/backorders.ts (created)
- backend/src/index.ts (mount)
- src/services/backorderAllocationService.ts (rewrite)

**Deploy required** (new backend route):
```
cd /var/www/tilessaas && git pull && cd backend && npm install && npm run build && pm2 restart tilessaas-backend --update-env && cd .. && npm install && npm run build
```
