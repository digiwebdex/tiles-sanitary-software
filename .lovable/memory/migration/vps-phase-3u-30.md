---
name: VPS Migration Phase 3U-30 (partial)
description: Component sweep — 7/13 files migrated to VPS endpoints; 6 deferred to 3U-30b
type: feature
---

# Phase 3U-30 (partial)

## Helpers added
- `challanService.setShowPrice(challanId, showPrice)` → PATCH /api/challans/:id/show-price
- `useDealerInfo` extended with `allow_backorder` field (sourced from /api/dealers/:id payload)

## Files migrated (7/13)
- src/modules/products/UpdateCostPriceDialog.tsx — POST /api/products/:id/cost-price (atomic stock + audit)
- src/pages/display-sample/MoveToDisplayDialog.tsx — GET /api/products
- src/modules/purchase-returns/PurchaseReturnForm.tsx — GET /api/suppliers + /api/products
- src/components/CreatePurchaseDraftDialog.tsx — GET /api/suppliers
- src/modules/sales-returns/SalesReturnForm.tsx — salesService.list (most-recent page)
- src/modules/products/CreateReservationDialog.tsx — GET /api/customers + batchService.getActiveBatches
- src/modules/purchases/PurchaseForm.tsx — GET /api/suppliers, /api/products, /api/products/last-purchase-map, /api/products/cost-map

## Files deferred to 3U-30b (6/13)
- src/modules/sales/SaleList.tsx — uses /api/sales/delivery-flags + /api/sales/:id (for delivery dialog)
- src/modules/sales/SaleForm.tsx — products + stock + customers + reservations
- src/modules/products/ProductForm.tsx — /api/products/:id/last-purchase
- src/pages/sales/POSSalePage.tsx — products with `or` search + customers
- src/pages/sales/InvoicePage.tsx — /api/sales/:id/returns + linked challan + POST /api/sales/:id/payment
- src/pages/sales/ChallanPage.tsx — challanService.setShowPrice toggle

## Notes
- All required VPS endpoints exist (added in 3U-29).
- Salesman gets 403 on dealer_admin-only endpoints; UI tolerates empty map fallback.
- No backend changes needed in 3U-30; pure frontend rewiring.
