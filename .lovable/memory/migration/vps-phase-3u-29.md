---
name: VPS Migration Phase 3U-29 (PARTIAL — backend only)
description: Backend endpoints for component-level Supabase sweep; frontend migration deferred to 3U-30
type: feature
---

# Phase 3U-29 — Backend prep for component sweep (PARTIAL)

**Status:** Backend endpoints added. Frontend migration of the 18 component files is deferred to 3U-30.

## What was done

### DB
- Migration in 3U-28 already covered. No new migrations.

### Backend endpoints added (all live after `pm2 restart tilessaas-backend`)

1. **`GET /api/sales/delivery-flags?dealerId=X`** (sales.ts)
   Returns `{ deliveredSaleIds: string[], challanDeliveryStatuses: Record<saleId, status> }`.
   Replaces the two `supabase.from('deliveries'/'challans')` map queries in `SaleList.tsx`.

2. **`GET /api/sales/:id/returns`** (sales.ts)
   Returns hydrated `sales_returns` rows (with `products.name`) for an InvoicePage.

3. **`POST /api/sales/:id/payment`** (sales.ts) — atomic
   Body: `{ amount, note?, payment_mode? }`. In one transaction:
   - `customer_ledger` insert (type='payment')
   - `cash_ledger` insert (type='receipt')
   - `sales.paid_amount` + `due_amount` UPDATE
   - Validates `paid <= total - discount` to prevent overpayment.
   Replaces the unsafe inline `supabase.from('sales').update()` from `InvoicePage.tsx` line 105.

4. **`PATCH /api/challans/:id/show-price`** (challans.ts) — dealer_admin only
   Body: `{ show_price: boolean }`. Replaces the supabase update in `ChallanPage.handleShowPriceToggle`.

5. **`GET /api/products/:id/last-purchase`** (products.ts)
   Returns `{ landed_cost, purchase_rate, purchase_date }` for the most recent purchase of this product. Used by `ProductForm` edit mode.

6. **`GET /api/products/last-purchase-map`** (products.ts) — dealer_admin only
   Returns `{ [productId]: { purchase_rate, landed_cost, purchase_date, supplier_name } }` for ALL products. Used by `PurchaseForm`.

7. **`POST /api/products/:id/cost-price`** (products.ts) — dealer_admin only
   Body: `{ cost, reason }`. Updates `stock.average_cost_per_unit` and writes a `PRICE_CHANGE` audit row in one go. Replaces the supabase + frontend `logAudit` combo in `UpdateCostPriceDialog.tsx`.

## Files changed (this phase)
- `backend/src/routes/sales.ts` — added 3 endpoints (~125 lines before `GET /:id`)
- `backend/src/routes/challans.ts` — added 1 endpoint
- `backend/src/routes/products.ts` — added 3 endpoints

## NOT yet done (frontend sweep — Phase 3U-30)

The 18 frontend files still import `@/integrations/supabase/client` and call it. They need to be migrated to use the new endpoints above plus existing endpoints (`/api/products`, `/api/customers`, `/api/suppliers`, `/api/stock`, `/api/sales`, `/api/challans`, `/api/reservations`, `/api/batches`, `/api/subscriptions`, `/api/dealers`):

| File | Replace with |
|---|---|
| `src/modules/sales/SaleForm.tsx` | products list → `/api/products?f.active=true`; dealer settings → `/api/dealers/:id`; stock → `/api/stock`; customers → `/api/customers?f.status=active`; reservations → `/api/reservations?customer_id=X&status=active` |
| `src/modules/purchases/PurchaseForm.tsx` | suppliers → `/api/suppliers`; products → `/api/products?f.active=true`; last-purchase → `/api/products/last-purchase-map`; avg cost → `/api/stock` |
| `src/modules/sales/SaleList.tsx` | delivery/challan maps → `/api/sales/delivery-flags`; sale-with-items → `salesService.getById` (already on VPS) |
| `src/modules/sales-returns/SalesReturnForm.tsx` | sales-for-return → `/api/sales?dealerId=X` |
| `src/modules/purchase-returns/PurchaseReturnForm.tsx` | suppliers → `/api/suppliers?f.status=active`; products → `/api/products?f.active=true` |
| `src/modules/products/ProductForm.tsx` | last-cost → `/api/products/:id/last-purchase` |
| `src/modules/products/CreateReservationDialog.tsx` | customers → `/api/customers?f.status=active`; batches → `/api/batches?productId=X` |
| `src/modules/products/UpdateCostPriceDialog.tsx` | direct stock UPDATE + logAudit → `POST /api/products/:id/cost-price` |
| `src/components/CreatePurchaseDraftDialog.tsx` | suppliers → `/api/suppliers` |
| `src/pages/display-sample/MoveToDisplayDialog.tsx` | products → `/api/products?f.active=true` |
| `src/pages/sales/InvoicePage.tsx` | returns → `/api/sales/:id/returns`; linked challan → `/api/challans/by-sale/:saleId`; payment mutation → `POST /api/sales/:id/payment` |
| `src/pages/sales/ChallanPage.tsx` | show_price toggle → `PATCH /api/challans/:id/show-price` |
| `src/pages/sales/POSSalePage.tsx` | products → `/api/products?f.active=true&search=X`; customers → `/api/customers?f.status=active` |
| `src/pages/settings/SettingsPage.tsx` | dealer settings + toggles → `PATCH /api/dealers/:id` (needs schema extension to allow `allow_backorder` + `default_wastage_pct`) |
| `src/pages/admin/PortalUsersPage.tsx` | customers → `/api/customers` |
| `src/pages/admin/DealerUsersOverview.tsx` | needs new `GET /api/admin/dealer-users-overview` (dealers + profiles + user_roles join) |
| `src/pages/super-admin/SARevenuePage.tsx` | subscriptions → `/api/subscriptions` (already exists, returns dealer + plan join) |
| `src/pages/super-admin/SADealerPaymentsPage.tsx` | already has VPS-first path with Supabase fallback — just delete the fallback |

## Outstanding backend additions still needed for 3U-30
1. `PATCH /api/dealers/:id` — extend `updateDealerSchema` to accept `allow_backorder: boolean` and `default_wastage_pct: number`.
2. `GET /api/admin/dealer-users-overview` — super_admin only, joins dealers + profiles + user_roles.

## Deployment
Backend rebuild + PM2 restart required:
```
cd /var/www/tilessaas/backend && git pull && npm install && npm run build && pm2 restart tilessaas-backend
```
Frontend will continue working unchanged (still uses Supabase) until 3U-30 swaps the callers over.
