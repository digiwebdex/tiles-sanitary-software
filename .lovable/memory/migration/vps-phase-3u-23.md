---
name: VPS Migration Phase 3U-23
description: deliveryService dead-write cleanup; redundant client-side updateSaleDeliveryStatus removed (already atomic on VPS POST /api/deliveries)
type: feature
---

## Scope
- Removed `deliveryService.updateSaleDeliveryStatus` (80 lines) — was double-writing sale_items.fulfillment_status, sales.sale_status, and triggering commission promotion AFTER the VPS endpoint had already done it atomically (Phase 3O).
- Removed the only caller in `CreateDeliveryDialog.tsx`.

## Kept (intentional)
- `list`, `getById`, `getDeliveryBatches`, `getDeliveredQtyBySale`, `getStockForProducts` — active read paths, still on Supabase. Migrating them = full new VPS read routes; out of scope for cleanup phase. Will queue as Phase 3U-24 if desired.

## Other services audited
- `purchaseService.ts` (71 lines), `purchaseReturnService.ts`, `salesReturnService.ts`, `challanService.ts`, `expenseService.ts`, `reservationService.ts`, `approvalService.ts` — already VPS-only, no Supabase imports. No cleanup needed.

## Files changed
- `src/services/deliveryService.ts` — 248 → 168 lines
- `src/modules/deliveries/CreateDeliveryDialog.tsx` — dropped post-create status sync call
