---
name: VPS Migration Phase 3U-17
description: Cleanup pass — supplier/customer/product/challan/salesReturn/purchaseReturn services fully VPS-only; added GET endpoints for challans + returns
type: feature
---
Phase 3U-17 (Cleanup pass + missing read endpoints):

**Backend (new GET endpoints):**
- `GET /api/returns/purchases` — paginated list with supplier join
- `GET /api/returns/sales` — list with sales/customer/product joins
- `GET /api/returns/sales/sale-items/:saleId` — sale items for return form
- `GET /api/challans` — list with sales/customer/project/site joins, projectId/siteId filters
- `GET /api/challans/by-sale/:saleId` — challans for a sale
- `GET /api/challans/:id` — full challan detail with sale + items + project + site

**Frontend (services rewritten as VPS-only, removed dead Supabase fallback branches):**
- `supplierService` — list/getById/create/update/toggleStatus
- `customerService` — list/getById/create/update/toggleStatus/getDueBalance
- `challanService` — full surface (list/getById/getBySaleId/create/markDelivered/convertToInvoice/update/cancelChallan/updateDeliveryStatus)
- `salesReturnService` — list/getSaleItems/create
- `purchaseReturnService` — list/getNextReturnNo/create
- `productService` — removed supabase profiles lookup; uses vpsTokenStore directly

**Still pending in next phases:**
- 3U-18: stale supabase calls in salesService/batchService/reservationService/approvalService/ledgerService/backorderAllocationService/purchaseService/deliveryService/notificationService
- 3U-19: reportService + pricingTierReportService full migration
- 3U-20: portalService (9 RPCs)
- 3U-21: 13 edge functions → VPS endpoints/cron
- 3U-22: final supabase client removal + types extraction
