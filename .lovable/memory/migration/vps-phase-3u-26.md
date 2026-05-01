---
name: VPS Migration Phase 3U-26
description: Mass cleanup phase — projectReportService VPS-only, stockService dead-code removal, batchService mutation wrappers removed, salesService.checkStockAvailability removed
type: feature
---
Phase 3U-26 closed out the long tail of the VPS migration as a pure cleanup pass. No new backend routes were added — every removed code path already had an atomic VPS replacement from earlier phases (3K, 3L, 3M, 3O).

## Files cleaned (2,366 → 706 lines, −1,660 / −70%)

### `src/services/projectReportService.ts` (513 → 126 lines)
All 7 reports (`salesByProject`, `outstandingByProject`, `deliveryHistoryBySite`, `quotationPipeline`, `topActiveProjects`, `siteSummary`, `siteHistory`, `dashboardStats`) already had `if (USE_VPS) return vpsGet(...)` early-returns. Removed the Supabase fallback branches because `env.AUTH_BACKEND` is forced to `"vps"` on every prod/preview host (`sanitileserp.com`, `lovable.app`, `lovableproject.com`).

### `src/services/stockService.ts` (387 → 144 lines)
Removed dead code with zero in-tree callers:
- `reserveStock`, `unreserveStock`, `deductReservedStock` — superseded by VPS challan + delivery atomic endpoints (Phase 3O).
- `updateAverageCost` — moved into POST /api/purchases transaction (Phase 3K).
- `applyStockChange`, `computeStockUpdate`, `getOrCreateStock` — local fallback for the dead `USE_VPS=false` branch.

Kept: `getAvailableQty` (preview) + `deductStockWithBackorder` (legacy wrapper, now thin VPS shim).

### `src/services/batchService.ts` (389 → 173 lines)
Removed mutation wrappers replaced by atomic VPS RPCs:
- `findOrCreateBatch` → handled by POST /api/purchases (Phase 3K).
- `executeSaleAllocation` → handled by POST /api/sales (Phase 3L) via server-side `allocate_sale_batches` RPC.
- `restoreBatchAllocations` → handled by PUT/DELETE /api/sales/:id (Phase 3M) via `restore_sale_batches` RPC.
- `deductStockUnbatched` → handled inside VPS sale create / adjustment.

Kept (read-only previews used by SaleForm): `planFIFOAllocation`, `getActiveBatches`, `getAllBatches`.

### `src/services/salesService.ts` (324 → 263 lines)
Removed `checkStockAvailability` (zero callers — backorder validation is now atomic inside POST /api/sales).

## Intentionally NOT migrated
- **`notificationService.ts`** — edge function dispatch is the correct architecture (server-side BulkSMSBD/SMTP keys never leave Supabase). Aligns with the original `vps-phase-3u-14` deferral decision.
- **`previewBatchAllocation` in salesService** — still calls `batchService.planFIFOAllocation` (Supabase reads). This is a UI-only preview used to surface mixed-shade warnings before submit; the actual allocation is performed atomically server-side at sale-create time.

## Deployment
Frontend-only change. No backend rebuild or PM2 restart needed.
