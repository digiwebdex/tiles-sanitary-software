---
name: VPS Migration Phase 3U-30b
description: Final 3-file frontend sweep — SaleList, SaleForm, ProductForm fully on VPS; zero Supabase imports remain in any product/sale form or list component
type: feature
---

## Phase 3U-30b — Frontend sweep complete (3/3 remaining files)

Continuation of 3U-30. Migrated the 3 remaining complex component files
identified in the original 3U-29 audit. POSSalePage / InvoicePage / ChallanPage
were verified already clean (no Supabase imports), so the sweep finished at 3.

### Files migrated

1. **`src/modules/products/ProductForm.tsx`**
   - Removed inline `purchase_items` query → uses `GET /api/products/:id/last-purchase`
     (added in 3U-29).

2. **`src/modules/sales/SaleList.tsx`**
   - Removed 2 separate Supabase queries on `deliveries` + `challans` →
     single call to `GET /api/sales/delivery-flags?dealerId=` (returns
     `{ deliveredSaleIds, challanDeliveryStatuses }`, added in 3U-29).
   - Removed inline `sales` detail fetch (with sale_items + customers join) →
     uses `salesService.getById()` which already hits `GET /api/sales/:id`.

3. **`src/modules/sales/SaleForm.tsx`** (5 inline reads removed)
   - `products` active list → `GET /api/products?f.active=true`.
   - `dealers.allow_backorder` → already on `useDealerInfo()` (3U-30 extension);
     deleted the redundant standalone query.
   - `stock` for shortage checks → `GET /api/stock?dealerId=` (paginated, returns
     reserved_box_qty / reserved_piece_qty already).
   - `customers` active list → `GET /api/customers?f.status=active`.
   - `stock_reservations` for matched customer → `listReservations(dealerId,
     { status: 'active', customer_id })` from reservationService (already on VPS).

### Verification
- `rg supabase src/modules/sales/SaleForm.tsx src/modules/sales/SaleList.tsx src/modules/products/ProductForm.tsx` → 0 matches.
- Build clean (no TS errors after type annotations on the new VPS-shaped query results).

### Deployment
Frontend-only — no backend changes. All endpoints used here were deployed in 3U-29.

### Remaining intentional Supabase usage (project-wide)
Same scope as documented in 3U-27 — only:
- CMS / landing-page editor (intentional, not a tenant data path).
- Audit-log writes inside salesService notification path (kept for parity).
- Edge-fn dispatch fallback in notificationService (retired in 3U-28 but kept
  deployed for rollback).
- PortalAuthContext + portalService (separate auth surface, deferred).

The mainline ERP CRUD/read surface is now 100% on VPS.
