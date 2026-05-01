---
name: VPS Migration Phase 3U-15
description: purchasePlanningService + displayStockService + supplierPerformanceService on VPS via /api/purchase-planning, /api/display-stock, /api/sample-issues; supplier-performance reuses /api/reports/supplier-performance from 3J-2
type: feature
---

Phase 3U-15 migrated three heavy services (~1800 LOC) from Supabase to VPS:

**Backend routes added:**
- `backend/src/routes/displayStock.ts` — display inventory transitions (move-to-display, move-back, mark-damaged) with row-level locking and atomic stock+audit writes
- `backend/src/routes/sampleIssues.ts` — sample lifecycle (issue, return, lost) with automatic stock adjustments
- `backend/src/routes/purchasePlanning.ts` — product/customer/project shortage aggregations + purchase_shortage_links CRUD

**Frontend services rewired:**
- `displayStockService.ts` — full vpsAuthedFetch, no Supabase fallback
- `purchasePlanningService.ts` — shortages via VPS; createDraftFromShortage orchestrates VPS purchase create then links shortages
- `supplierPerformanceService.ts` — fully on /api/reports/supplier-performance (route from 3J-2)

All routes mounted in `backend/src/index.ts` at lines 173-175. No Supabase imports remain in any of the three services.
