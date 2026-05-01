---
name: VPS Migration Phase 3U-18a
description: Stripped dead Supabase fallback branches from 7 services already gated by USE_VPS
type: feature
---

Removed dead `if (USE_VPS) { ... } else { ...supabase... }` fallback code from services where the VPS branch always runs in production. Pure cleanup — zero behavior change.

**Files cleaned (Supabase imports removed entirely):**
- `src/services/ledgerService.ts` — customer/supplier/cash/expense ledger
- `src/services/reservationService.ts` — all reservation RPCs
- `src/services/approvalService.ts` — approval CRUD + RPCs
- `src/services/purchaseService.ts` — list, getById, create
- `src/services/pricingTierReportService.ts` — all pricing-tier reports
- `src/services/reportService.ts` — all 10 reports

**Files partially cleaned (mixed live + dead, dead stripped only):**
- `src/services/deliveryService.ts` — `create()` and `updateStatus()` legacy branches removed; list/getById/getDeliveryBatches/getDeliveredQtyBySale/getStockForProducts/updateSaleDeliveryStatus still call Supabase (need new VPS endpoints — Phase 3U-19)

**Deferred to Phase 3U-19+:**
- `salesService.ts` — has live Supabase calls in update/cancel paths needing VPS endpoints
- `batchService.ts` + `backorderAllocationService.ts` — only called from sales/purchase legacy branches; will be deleted/stubbed when those paths are gone
- `notificationService.ts` — still calls Supabase edge function `send-notification`
- `portalService.ts` — calls Supabase RPCs for portal context (separate auth context)
- `deliveryService.ts` reads — need new VPS routes
