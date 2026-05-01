---
name: VPS Migration Phase 3U-22
description: salesService.ts cleaned of dead Supabase fallbacks; only VPS paths remain for create/update/cancel; preview helpers retained
type: feature
---
# Phase 3U-22 — salesService cleanup

**Date:** 2026-05-01

## What changed
- `src/services/salesService.ts` reduced from 1063 → 324 lines.
- Removed all Supabase fallback branches in `create`, `update`, `cancelSale` (Phase 3L/3M VPS paths are the only production code path).
- Removed dead imports: `stockService`, `customerLedgerService`, `cashLedgerService`, `logAudit`, `validateInput`, `consumeReservation`, plus dead helpers `generateInvoiceNumber` and `isDealerBackorderEnabled`.
- Removed `USE_VPS` gate — `list`, `getById`, `create`, `update`, `cancelSale` are now unconditionally VPS.
- Kept read-only helpers `checkStockAvailability` + `previewBatchAllocation` (still used by SaleForm UI; both query Supabase directly).

## Not touched (still in use elsewhere)
- `src/services/stockService.ts` — used by `StockAdjustDialog`, `BrokenStockDialog`, test file.
- `src/services/batchService.ts` — used by `previewBatchAllocation` helper and as type import in `SaleForm`.

## Deploy
Frontend-only change; bundled at next Lovable Publish.
